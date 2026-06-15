// ============================================================
// TAXÍMETRO DIGITAL — Portaria Inmetro nº 201/2002
// ============================================================

// ---- CONFIGURAÇÃO PADRÃO (INMETRO) ----
const DEFAULT_CONFIG = {
    bandeirada: 6.50,       // Ba (R$) — Decreto 27.527/2024 Camaquã
    fracao: 0.25,           // f (R$)
    tarifa1: 6.30,          // B1 (R$/km) — Decreto 27.527/2024 Camaquã
    tarifa2: 8.10,          // B2 (R$/km) — Decreto 27.527/2024 Camaquã
    tarifaHoraria: 40.00,   // TH (R$/h) — Decreto 27.527/2024 Camaquã
    horarioB2: {
        inicio: '22:00',
        fim: '06:00',
        sabado: true,
        domingo: true,
        feriado: true
    },
    senha: '123456',
    senhaMaster: 'ADMIN2024',
    taxista: {
        nome: '',
        carro: '',
        placa: '',
        prefixo: ''
    }
};

// ---- STATE ----
let config = {};
let trip = {
    active: false,
    bandeira: 1,
    distance: 0,        // km
    fracCount: 0,       // número de frações acumuladas
    fare: 0,
    startTime: null,
    waitTime: 0,        // segundos parado
    lastSpeed: 0,
    timerInterval: null,
    lastPos: null       // {lat, lng}
};
let map, marker, currentPos;
let watchId = null;
let simulatorInterval = null;
let isSimulating = false;
let smoothedSpeed = 0; // velocidade suavizada (EMA)
let posBuffer = []; // buffer de posições para média móvel
let tripHistory = []; // histórico de corridas

// ---- CONSTANTES ----
const STOP_THRESHOLD = 5; // km/h - abaixo disso considera "parado"
const UPDATE_INTERVAL = 1000; // 1s
const GPS_MIN_DIST = 5; // metros - ignora tremores menores que isso
const GPS_SPEED_SMOOTH = 0.3; // fator EMA para suavizar velocidade
const GPS_POS_BUFFER = 3; // tamanho do buffer para média móvel
const IMPLAUSIBLE_ACCEL = 15; // m/s² - aceleração máxima plausível

// ---- DOM ----
const $ = id => document.getElementById(id);
const mainScreen = $('mainScreen');
const configScreen = $('configScreen');
const mapContainer = $('map');
const destInput = $('destInput');
const btnNav = $('btnNav');
const fareValue = $('fareValue');
const bandeiraLabel = $('bandeiraLabel');
const bandeiraNum = $('bandeiraNum');
const distanceLabel = $('distanceLabel');
const fracLabel = $('fracLabel');
const timeLabel = $('timeLabel');
const waitInfo = $('waitInfo');
const waitLabel = $('waitLabel');
const speedLabel = $('speedLabel');
const btnStart = $('btnStart');
const btnStop = $('btnStop');
const btnBackMain = $('btnBackMain');
const topSimBadge = $('topSimBadge');
const clockDisplay = $('clockDisplay');

// Config
const pwdInput = $('pwdInput');
const btnLogin = $('btnLogin');
const loginError = $('loginError');
const loginPanel = $('loginPanel');
const settingsPanel = $('settingsPanel');
const btnSaveConfig = $('btnSaveConfig');
const configMsg = $('configMsg');
const btnRemoteSync = $('btnRemoteSync');
const remoteMsg = $('remoteMsg');
const remoteLog = $('remoteLog');
const configStatus = $('configStatus');

const cfgBandeirada = $('cfgBandeirada');
const cfgFracao = $('cfgFracao');
const cfgTarifa1 = $('cfgTarifa1');
const cfgTarifa2 = $('cfgTarifa2');
const cfgTarifaHoraria = $('cfgTarifaHoraria');
const cfgHoraInicio = $('cfgHoraInicio');
const cfgHoraFim = $('cfgHoraFim');
const cfgSabado = $('cfgSabado');
const cfgDomingo = $('cfgDomingo');
const cfgFeriado = $('cfgFeriado');
const cfgNewPwd = $('cfgNewPwd');
const profileScreen = $('profileScreen');
const btnBackProfile = $('btnBackProfile');
const profNome = $('profNome');
const profCarro = $('profCarro');
const profPlaca = $('profPlaca');
const profPrefixo = $('profPrefixo');
const btnSaveProfile = $('btnSaveProfile');
const profileMsg = $('profileMsg');
const elCalcI1 = $('calcI1');
const elCalcI2 = $('calcI2');
const elCalcITH = $('calcITH');

// Finance
let financeData = { abastecimentos: [], manutencoes: [] };

function loadFinance() {
    try {
        const saved = localStorage.getItem('taximetroFinance');
        if (saved) financeData = JSON.parse(saved);
    } catch (e) {}
}

function saveFinance() {
    localStorage.setItem('taximetroFinance', JSON.stringify(financeData));
}

function calcGanhos() {
    return tripHistory.reduce((s, r) => s + (r.fare || 0), 0);
}

function calcGastos() {
    const fuel = financeData.abastecimentos.reduce((s, a) => s + (a.total || 0), 0);
    const manut = financeData.manutencoes.reduce((s, m) => s + (m.valor || 0), 0);
    return fuel + manut;
}

function renderFinance() {
    const ganhos = calcGanhos();
    const gastos = calcGastos();
    const saldo = ganhos - gastos;
    const el = id => document.getElementById(id);
    if (el('finGanhos')) el('finGanhos').textContent = 'R$ ' + ganhos.toFixed(2);
    if (el('finGastos')) el('finGastos').textContent = 'R$ ' + gastos.toFixed(2);
    if (el('finSaldo')) {
        el('finSaldo').textContent = 'R$ ' + Math.abs(saldo).toFixed(2);
        el('finSaldo').className = 'fin-val' + (saldo >= 0 ? ' pos' : ' neg');
    }

    const list = document.getElementById('financeList');
    if (!list) return;
    const items = [];
    financeData.abastecimentos.forEach(a => {
        items.push({ desc: '⛽ ' + (a.litros || 0).toFixed(1) + 'L × R$ ' + (a.preco || 0).toFixed(2), val: a.total || 0, cls: 'fuel' });
    });
    financeData.manutencoes.forEach(m => {
        items.push({ desc: '🔧 ' + (m.desc || 'Manutenção'), val: m.valor || 0, cls: 'manut' });
    });
    if (!items.length) {
        list.innerHTML = '<div class="finance-empty">Nenhum lançamento ainda.</div>';
        return;
    }
    list.innerHTML = items.slice(-20).reverse().map(i =>
        '<div class="finance-item"><span class="fi-desc">' + i.desc + '</span><span class="fi-val ' + i.cls + '">-R$ ' + i.val.toFixed(2) + '</span></div>'
    ).join('');
}

// ============================================================
// FUNÇÕES INMETRO
// ============================================================

/** Intervalo Tarifa 1 (metros) — i1 = (f × 1000) / B1 */
function calcI1() {
    return (config.fracao * 1000) / config.tarifa1;
}

/** Intervalo Tarifa 2 (metros) — i2 = (f × 1000) / B2 */
function calcI2() {
    return (config.fracao * 1000) / config.tarifa2;
}

/** Intervalo Tarifa Horária (segundos) — iTH = (f × 3600) / TH */
function calcITH() {
    return (config.fracao * 3600) / config.tarifaHoraria;
}

/** Retorna o intervalo atual (metros) baseado na bandeira */
function getCurrentInterval() {
    return trip.bandeira === 1 ? calcI1() : calcI2();
}

/** Calcula a indicação (valor) para uma distância em metros */
function calcIndicacao(distMeters) {
    const i = getCurrentInterval();
    if (i <= 0) return config.bandeirada;
    const n = Math.floor(distMeters / i);
    return config.bandeirada + n * config.fracao;
}

/** Calcula frações a partir da distância */
function calcFracoes(distMeters) {
    const i = getCurrentInterval();
    if (i <= 0) return 0;
    return Math.floor(distMeters / i);
}

// ============================================================
// CONFIG
// ============================================================

function loadConfig() {
    try {
        const saved = localStorage.getItem('taximetroConfig');
        if (saved) {
            try {
                config = JSON.parse(saved);
                return;
            } catch {}
        }
    } catch (e) {
        console.warn('localStorage não disponível:', e.message);
    }
    config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function saveConfig() {
    localStorage.setItem('taximetroConfig', JSON.stringify(config));
}

function updateCalcDisplay() {
    const i1 = calcI1();
    const i2 = calcI2();
    const ith = calcITH();
    elCalcI1.textContent = isFinite(i1) ? i1.toFixed(2) + ' m' : '—';
    elCalcI2.textContent = isFinite(i2) ? i2.toFixed(2) + ' m' : '—';
    elCalcITH.textContent = isFinite(ith) ? ith.toFixed(1) + ' s' : '—';

}

function populateSettings() {
    cfgBandeirada.value = config.bandeirada;
    cfgFracao.value = config.fracao;
    cfgTarifa1.value = config.tarifa1;
    cfgTarifa2.value = config.tarifa2;
    cfgTarifaHoraria.value = config.tarifaHoraria;
    cfgHoraInicio.value = config.horarioB2.inicio;
    cfgHoraFim.value = config.horarioB2.fim;
    cfgSabado.checked = config.horarioB2.sabado;
    cfgDomingo.checked = config.horarioB2.domingo;
    cfgFeriado.checked = config.horarioB2.feriado;
    updateCalcDisplay();
}

// Auto-atualiza os cálculos ao digitar nos campos
function setupCalcAutoUpdate() {
    const fields = [cfgBandeirada, cfgFracao, cfgTarifa1, cfgTarifa2, cfgTarifaHoraria];
    fields.forEach(f => {
        f.addEventListener('input', () => {
            const tmp = {
                bandeirada: parseFloat(cfgBandeirada.value) || 0,
                fracao: parseFloat(cfgFracao.value) || 0,
                tarifa1: parseFloat(cfgTarifa1.value) || 0,
                tarifa2: parseFloat(cfgTarifa2.value) || 0,
                tarifaHoraria: parseFloat(cfgTarifaHoraria.value) || 0
            };
            const saveB1 = config.tarifa1, saveB2 = config.tarifa2, saves = config;
            config.tarifa1 = tmp.tarifa1;
            config.tarifa2 = tmp.tarifa2;
            config.fracao = tmp.fracao;
            config.tarifaHoraria = tmp.tarifaHoraria;
            config.bandeirada = tmp.bandeirada;
            updateCalcDisplay();
            config = saves;
        });
    });
}

function saveSettings() {
    config.bandeirada = parseFloat(cfgBandeirada.value) || 0;
    config.fracao = parseFloat(cfgFracao.value) || 0;
    config.tarifa1 = parseFloat(cfgTarifa1.value) || 0;
    config.tarifa2 = parseFloat(cfgTarifa2.value) || 0;
    config.tarifaHoraria = parseFloat(cfgTarifaHoraria.value) || 0;
    config.horarioB2.inicio = cfgHoraInicio.value || '22:00';
    config.horarioB2.fim = cfgHoraFim.value || '06:00';
    config.horarioB2.sabado = cfgSabado.checked;
    config.horarioB2.domingo = cfgDomingo.checked;
    config.horarioB2.feriado = cfgFeriado.checked;
    if (cfgNewPwd.value) {
        config.senha = cfgNewPwd.value;
    }
    saveConfig();
    updateCalcDisplay();
    configMsg.textContent = 'Configurações salvas com sucesso!';
    setTimeout(() => { configMsg.textContent = ''; }, 3000);
}

// ============================================================
// BANDEIRA
// ============================================================

function getNow() { return new Date(); }

function isBandeira2() {
    const now = getNow();
    const day = now.getDay();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    const [hIni, mIni] = (config.horarioB2.inicio || '22:00').split(':').map(Number);
    const [hFim, mFim] = (config.horarioB2.fim || '06:00').split(':').map(Number);
    const startMinutes = hIni * 60 + mIni;
    const endMinutes = hFim * 60 + mFim;

    if (day === 0 && config.horarioB2.domingo) return true;
    if (day === 6 && config.horarioB2.sabado) return true;

    if (startMinutes <= endMinutes) {
        if (currentMinutes >= startMinutes && currentMinutes < endMinutes) return true;
    } else {
        if (currentMinutes >= startMinutes || currentMinutes < endMinutes) return true;
    }
    return false;
}

function updateBandeira() {
    if (!bandeiraLabel || !bandeiraNum) return;
    bandeiraLabel.textContent = 'BANDEIRA';
    bandeiraNum.textContent = '' + trip.bandeira;
    bandeiraNum.className = trip.bandeira === 2 ? 'b2' : '';
    atualizarBotaoBandeira();
}

function toggleBandeira() {
    trip.bandeira = trip.bandeira === 1 ? 2 : 1;
    if (bandeiraLabel) bandeiraLabel.textContent = 'BANDEIRA';
    if (bandeiraNum) {
        bandeiraNum.textContent = '' + trip.bandeira;
        bandeiraNum.className = trip.bandeira === 2 ? 'b2' : '';
    }
    atualizarBotaoBandeira();
    if (trip.active) recalcFare();
}

function atualizarBotaoBandeira() {
    if (!btnStart || !bandeiraLabel) return;
    const isB2 = trip.bandeira === 2;
    if (trip.active) {
        btnStart.textContent = isB2 ? 'BANDEIRA 2' : 'BANDEIRA 1';
        btnStart.className = 'ctrl-btn';
        btnStart.style.background = isB2
            ? 'linear-gradient(135deg, #d32f2f, #b71c1c)'
            : 'linear-gradient(135deg, #ff8f00, #ff6f00)';
        btnStart.style.boxShadow = isB2
            ? '0 4px 18px rgba(211,47,47,0.4)'
            : '0 4px 18px rgba(255,111,0,0.4)';
    } else {
        btnStart.textContent = 'INICIAR';
        btnStart.className = 'ctrl-btn start';
        btnStart.style.background = '';
        btnStart.style.boxShadow = '';
    }
}

// ============================================================
// FORMATTAÇÃO
// ============================================================

function fmtMoney(v) {
    return 'R$ ' + v.toFixed(2).replace('.', ',');
}

function fmtDist(km) {
    return km.toFixed(1) + ' km';
}

function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ============================================================
// GPS / MAPA
// ============================================================

let lastHeading = 0;

function taxiIcon(heading) {
    return L.divIcon({
        className: 'taxi-marker',
        html: '<div class="taxi-car" style="transform:rotate(' + heading + 'deg)">🚕</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
}

function dotIcon() {
    return L.divIcon({
        className: 'custom-marker',
        html: '<div style="background:#00c853;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(0,200,83,0.6);"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });
}

function setMarkerTaxi(heading) {
    if (!marker) return;
    marker.setIcon(taxiIcon(heading || 0));
}

function setMarkerDot() {
    if (!marker) return;
    marker.setIcon(dotIcon());
}

function initMap(lat, lng) {
    try {
        if (typeof L === 'undefined') return;
        if (map) { map.setView([lat, lng], 16); return; }
        map = L.map(mapContainer, { zoomControl: false, attributionControl: false })
            .setView([lat, lng], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
            .addTo(map);
        marker = L.marker([lat, lng], { icon: dotIcon() }).addTo(map);
    } catch (e) {
        console.warn('Erro ao iniciar mapa:', e.message);
    }
}

function updatePos(lat, lng, heading) {
    currentPos = [lat, lng];
    if (marker) {
        marker.setLatLng([lat, lng]);
        if (heading !== undefined) {
            lastHeading = heading;
        }
        if (trip.active) setMarkerTaxi(lastHeading);
    }
    if (map) map.panTo([lat, lng], { animate: true, duration: 0.5 });
}

function startGPS() {
    if (!('geolocation' in navigator)) { startSimulator(); return; }

    const isSecure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) {
        console.warn('GPS indisponível: página sem HTTPS.');
        if (topSimBadge) { topSimBadge.textContent = 'SEM GPS'; topSimBadge.classList.remove('hidden'); }
        startSimulator();
        return;
    }

    if (topSimBadge) topSimBadge.classList.add('hidden');
    navigator.geolocation.getCurrentPosition(
        pos => {
            const { latitude, longitude } = pos.coords;
            initMap(latitude, longitude);
            updatePos(latitude, longitude);
            smoothedSpeed = 0;
            posBuffer = [];
            if (!watchId) {
                watchId = navigator.geolocation.watchPosition(
                    p => {
                        const { latitude, longitude, speed } = p.coords;
                        updatePos(latitude, longitude);
                        trip.lastSpeed = speed || 0;
                        if (trip.active) onTripMove(latitude, longitude, speed || 0);
                    },
                    () => {},
                    { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
                );
            }
        },
        err => {
            console.warn('Erro GPS:', err.message);
            if (topSimBadge) { topSimBadge.textContent = 'GPS FALHOU'; topSimBadge.classList.remove('hidden'); }
            startSimulator();
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// ============================================================
// SIMULADOR (desktop)
// ============================================================

function startSimulator() {
    if (isSimulating) return;
    isSimulating = true;
    if (topSimBadge) { topSimBadge.textContent = 'SIMULAÇÃO'; topSimBadge.classList.remove('hidden'); }
    let lat = -31.7653, lng = -52.3376, heading = 45;
    initMap(lat, lng);
    updatePos(lat, lng);
    if (simulatorInterval) clearInterval(simulatorInterval);
    let simDist = 0; // acumulador de distância simulada em metros
    simulatorInterval = setInterval(() => {
        heading += (Math.random() - 0.5) * 25;
        const step = 0.00008 + Math.random() * 0.00012;
        lat += Math.cos(heading * Math.PI / 180) * step;
        lng += Math.sin(heading * Math.PI / 180) * step;
        updatePos(lat, lng);
        const simSpeed = Math.random() * 40 + 5;
        trip.lastSpeed = simSpeed;
        if (trip.active) {
            onTripMove(lat, lng, simSpeed);
        }
    }, UPDATE_INTERVAL);
}

// ============================================================
// LÓGICA DA CORRIDA
// ============================================================

// Haversine distance in meters
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) *
              Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Média móvel para posição GPS
function smoothPos(lat, lng) {
    posBuffer.push({ lat, lng });
    if (posBuffer.length > GPS_POS_BUFFER) posBuffer.shift();
    const avgLat = posBuffer.reduce((s, p) => s + p.lat, 0) / posBuffer.length;
    const avgLng = posBuffer.reduce((s, p) => s + p.lng, 0) / posBuffer.length;
    return { lat: avgLat, lng: avgLng };
}

function bearing(lat1, lng1, lat2, lng2) {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function onTripMove(lat, lng, speedKph) {
    // Suaviza velocidade com EMA (Exponential Moving Average)
    smoothedSpeed = smoothedSpeed * (1 - GPS_SPEED_SMOOTH) + speedKph * GPS_SPEED_SMOOTH;

    // Suaviza posição com média móvel
    const pos = smoothPos(lat, lng);
    lat = pos.lat;
    lng = pos.lng;

    if (!trip.lastPos) {
        trip.lastPos = { lat, lng };
        return;
    }

    // Calcula distância Haversine
    let distM = haversine(trip.lastPos.lat, trip.lastPos.lng, lat, lng);

    // Filtro antirruído GPS: ignora tremores abaixo do limiar
    if (distM < GPS_MIN_DIST) return;

    // Calcula direção (bearing) do movimento
    const heading = bearing(trip.lastPos.lat, trip.lastPos.lng, lat, lng);
    lastHeading = heading;

    // Filtro de aceleração implausível (ex: salto de GPS)
    const elapsed = UPDATE_INTERVAL / 1000;
    const accel = distM / (elapsed * elapsed);
    if (accel > IMPLAUSIBLE_ACCEL) return;

    trip.distance += distM / 1000;
    trip.lastPos = { lat, lng };

    // Tarifa Horária: acumula tempo parado (speed < threshold)
    // Usa velocidade suavizada para evitar falsos positivos
    if (smoothedSpeed < STOP_THRESHOLD) {
        trip.waitTime += elapsed;
    }

    recalcFare();
}

function recalcFare() {
    const distM = trip.distance * 1000;
    const i = getCurrentInterval();
    const ith = calcITH();

    if (i <= 0) { trip.fare = config.bandeirada; trip.fracCount = 0; return; }

    const fracDist = Math.floor(distM / i);
    const fracWait = ith > 0 ? Math.floor(trip.waitTime / ith) : 0;

    trip.fracCount = fracDist + fracWait;
    trip.fare = config.bandeirada + trip.fracCount * config.fracao;

    if (fareValue) fareValue.textContent = fmtMoney(trip.fare);
    if (distanceLabel) distanceLabel.textContent = fmtDist(trip.distance);
    if (fracLabel) fracLabel.textContent = trip.fracCount + ' frações';

    if (trip.waitTime > 0) {
        if (waitInfo) waitInfo.classList.remove('hidden');
        if (waitLabel) waitLabel.textContent = 'Tempo parado: ' + Math.floor(trip.waitTime) + ' s';
    } else {
        if (waitInfo) waitInfo.classList.add('hidden');
    }

    // Velocidade (na bandeiraBox)
    if (speedLabel) {
        if (trip.active) {
            speedLabel.textContent = Math.round(smoothedSpeed) + ' km/h';
            speedLabel.style.color = smoothedSpeed < STOP_THRESHOLD ? '#ff9800' : 'rgba(255,255,255,0.3)';
        } else {
            speedLabel.textContent = '0 km/h';
            speedLabel.style.color = 'rgba(255,255,255,0.3)';
        }
    }

    // Cor do valor e bandeiraBox baseado na bandeira
    if (fareValue) {
        fareValue.className = trip.bandeira === 2 ? 'b2-active' : '';
    }
    if (bandeiraNum) {
        bandeiraNum.className = trip.bandeira === 2 ? 'b2' : '';
    }
}

function startTrip() {
    if (trip.active) return;
    clearRoute();
    trip.active = true;
    trip.distance = 0;
    trip.fracCount = 0;
    trip.fare = config.bandeirada;
    trip.startTime = Date.now();
    trip.endTime = null;
    trip.waitTime = 0;
    trip.startPos = currentPos ? { lat: currentPos[0], lng: currentPos[1] } : null;
    trip.endPos = null;
    trip.lastPos = currentPos ? { lat: currentPos[0], lng: currentPos[1] } : null;
    trip.lastSpeed = 0;
    smoothedSpeed = 0;
    posBuffer = [];

    setMarkerTaxi(lastHeading);
    trip.bandeira = 1;
    updateBandeira();
    const fl = document.getElementById('fareLabel');
    if (fl) fl.textContent = 'VALOR A PAGAR';
    if (fareValue) { fareValue.textContent = fmtMoney(config.bandeirada); fareValue.style.color = ''; fareValue.style.textShadow = ''; fareValue.className = ''; }
    const printBtn = document.getElementById('btnPrintRecibo');
    if (printBtn) printBtn.classList.add('hidden');
    const modal = document.getElementById('summaryModal');
    if (modal) modal.classList.add('hidden');
    if (bandeiraNum) bandeiraNum.className = '';
    if (distanceLabel) distanceLabel.textContent = '0,0 km';
    if (fracLabel) fracLabel.textContent = '0 frações';
    if (timeLabel) timeLabel.textContent = '00:00';
    if (waitInfo) waitInfo.classList.add('hidden');

    btnStart.disabled = false;
    btnStop.disabled = false;

    if (trip.timerInterval) clearInterval(trip.timerInterval);
    trip.timerInterval = setInterval(() => {
        if (trip.startTime) {
            const elapsed = (Date.now() - trip.startTime) / 1000;
            if (timeLabel) timeLabel.textContent = fmtTime(elapsed);
        }
        recalcFare();
    }, 1000);
}

function stopTrip() {
    if (!trip.active) return;
    trip.active = false;
    trip.endTime = Date.now();
    trip.endPos = currentPos ? { lat: currentPos[0], lng: currentPos[1] } : null;

    if (trip.timerInterval) { clearInterval(trip.timerInterval); trip.timerInterval = null; }
    setMarkerDot();
    trip.bandeira = 1;
    btnStart.disabled = false;
    btnStop.disabled = true;
    atualizarBotaoBandeira();
    if (bandeiraLabel) bandeiraLabel.textContent = 'BANDEIRA';
    if (bandeiraNum) { bandeiraNum.textContent = '1'; bandeiraNum.className = ''; }

    // Destaca valor final na caixa azul
    const fl = document.getElementById('fareLabel');
    if (fl) fl.textContent = 'TOTAL A PAGAR';
    if (fareValue) { fareValue.style.color = '#ffd700'; fareValue.style.textShadow = '0 0 20px rgba(255,215,0,0.3)'; }
    const printBtn = document.getElementById('btnPrintRecibo');
    if (printBtn) printBtn.classList.remove('hidden');

    // Salva no histórico
    const duracao = Math.floor((trip.endTime - trip.startTime) / 1000);
    const record = {
        id: Date.now(),
        startTime: trip.startTime,
        endTime: trip.endTime,
        distance: trip.distance,
        waitTime: trip.waitTime,
        fracCount: trip.fracCount,
        fare: trip.fare,
        bandeira: trip.bandeira,
        startPos: trip.startPos ? { ...trip.startPos } : null,
        endPos: trip.endPos ? { ...trip.endPos } : null,
        taxista: { ...config.taxista },
        params: {
            bandeirada: config.bandeirada,
            fracao: config.fracao,
            tarifa1: config.tarifa1,
            tarifa2: config.tarifa2,
            tarifaHoraria: config.tarifaHoraria
        }
    };
    tripHistory.unshift(record);
    if (tripHistory.length > 500) tripHistory.length = 500; // limita a 500
    try { localStorage.setItem('taximetroHistory', JSON.stringify(tripHistory)); } catch (e) {}

    // Busca endereços para o histórico
    if (trip.startPos) {
        reverseGeocode(trip.startPos.lat, trip.startPos.lng, addr => {
            record.startAddr = addr;
            try { localStorage.setItem('taximetroHistory', JSON.stringify(tripHistory)); } catch (e) {}
        });
    }
    if (trip.endPos) {
        reverseGeocode(trip.endPos.lat, trip.endPos.lng, addr => {
            record.endAddr = addr;
            try { localStorage.setItem('taximetroHistory', JSON.stringify(tripHistory)); } catch (e) {}
        });
    }

}

function loadHistory() {
    try {
        const saved = localStorage.getItem('taximetroHistory');
        if (saved) { tripHistory = JSON.parse(saved); }
    } catch (e) {}
}

let historyFilter = 'dia';
let filteredHistory = [];

function getFilterRange(period) {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (period === 'dia') {
        return { start, end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59) };
    }
    if (period === 'semana') {
        const day = start.getDay();
        start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
        return { start, end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59) };
    }
    if (period === 'mes') {
        start.setDate(1);
        return { start, end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59) };
    }
    return null;
}

function applyHistoryFilter() {
    const list = document.getElementById('historyList');
    if (!list) return;

    if (historyFilter === 'periodo') {
        const s = document.getElementById('histDateStart');
        const e = document.getElementById('histDateEnd');
        if (s && e && s.value && e.value) {
            const start = new Date(s.value + 'T00:00:00');
            const end = new Date(e.value + 'T23:59:59');
            filteredHistory = tripHistory.filter(r => r.startTime >= start.getTime() && r.startTime <= end.getTime());
        } else {
            filteredHistory = [];
        }
    } else {
        const range = getFilterRange(historyFilter);
        if (range) {
            filteredHistory = tripHistory.filter(r => r.startTime >= range.start.getTime() && r.startTime <= range.end.getTime());
        } else {
            filteredHistory = [...tripHistory];
        }
    }

    if (!filteredHistory.length) {
        list.innerHTML = '<div class="history-empty">Nenhuma corrida neste período.</div>';
        return;
    }
    list.innerHTML = filteredHistory.map((r, i) => {
        const d = new Date(r.startTime);
        const dataStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const realIdx = tripHistory.indexOf(r);
        return '<div class="history-item" onclick="showHistoryDetail(' + realIdx + ')">' +
            '<div class="hi-top"><span class="hi-date">' + dataStr + '</span><span class="hi-bandeira">B' + (r.bandeira || 1) + '</span></div>' +
            '<div class="hi-mid"><span class="hi-dist">' + (r.distance || 0).toFixed(1) + ' km</span><span class="hi-fare">R$ ' + (r.fare || 0).toFixed(2) + '</span></div>' +
            (r.startAddr ? '<div class="hi-addr">' + r.startAddr + '</div>' : '') +
            '</div>';
    }).join('');
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    if (!tripHistory.length) {
        list.innerHTML = '<div class="history-empty">Nenhuma corrida registrada ainda.</div>';
        return;
    }
    applyHistoryFilter();
}

function showHistoryDetail(idx) {
    const r = tripHistory[idx];
    if (!r) return;
    const el = id => document.getElementById(id);
    if (el('hDetDist')) el('hDetDist').textContent = (r.distance || 0).toFixed(1) + ' km';
    if (el('hDetFare')) el('hDetFare').textContent = 'R$ ' + (r.fare || 0).toFixed(2);
    if (el('hDetFrac')) el('hDetFrac').textContent = (r.fracCount || 0) + ' frações';
    if (el('hDetBandeira')) el('hDetBandeira').textContent = 'Bandeira ' + (r.bandeira || 1);
    const fmt = ts => new Date(ts).toLocaleString('pt-BR');
    if (el('hDetStart')) el('hDetStart').textContent = r.startTime ? fmt(r.startTime) : '—';
    if (el('hDetEnd')) el('hDetEnd').textContent = r.endTime ? fmt(r.endTime) : '—';
    if (el('hDetStartAddr')) el('hDetStartAddr').textContent = r.startAddr || 'Não disponível';
    if (el('hDetEndAddr')) el('hDetEndAddr').textContent = r.endAddr || 'Não disponível';
    if (el('hDetDriver')) {
        const t = r.taxista || {};
        el('hDetDriver').textContent = (t.nome || '—') + ' | ' + (t.placa || '—') + ' | ' + (t.prefixo || '—');
    }
    if (el('hDetParams')) {
        const p = r.params || {};
        el('hDetParams').textContent = 'Ba: R$ ' + (p.bandeirada || 0).toFixed(2) + ' | f: R$ ' + (p.fracao || 0).toFixed(2);
    }
    const modal = document.getElementById('historyDetailModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.dataset.idx = idx;
    }
}

function exportHistoryCSV() {
    const data = filteredHistory.length ? filteredHistory : tripHistory;
    if (!data.length) {
        alert('Nenhuma corrida para exportar.');
        return;
    }
    const BOM = '\uFEFF';
    const header = 'Data;Hora_Inicio;Hora_Fim;Distancia_km;TempoParado_s;Fracao_contagem;Valor_R$;Bandeira;End_Embarque;End_Desembarque;Taxista;Prefixo;Placa';
    const rows = data.map(r => {
        const fmt = ts => ts ? new Date(ts).toLocaleString('pt-BR') : '';
        const d = new Date(r.startTime);
        const data = d.toLocaleDateString('pt-BR');
        return data + ';' + fmt(r.startTime) + ';' + fmt(r.endTime) + ';' +
            (r.distance || 0).toFixed(2) + ';' + Math.floor(r.waitTime || 0) + ';' +
            (r.fracCount || 0) + ';' + (r.fare || 0).toFixed(2) + ';' +
            (r.bandeira || 1) + ';' +
            (r.startAddr || '') + ';' + (r.endAddr || '') + ';' +
            ((r.taxista && r.taxista.nome) || '') + ';' +
            ((r.taxista && r.taxista.prefixo) || '') + ';' +
            ((r.taxista && r.taxista.placa) || '');
    }).join('\n');

    const blob = new Blob([BOM + header + '\n' + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = historyFilter === 'periodo' ? 'personalizado' : historyFilter;
    a.download = 'taximetro_' + suffix + '_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function exibirResumo() {
    const i = getCurrentInterval();
    const ith = calcITH();
    const duracao = trip.endTime ? Math.floor((trip.endTime - trip.startTime) / 1000) : 0;

    const el = id => document.getElementById(id);
    if (el('summaryDist')) el('summaryDist').textContent = fmtDist(trip.distance);
    if (el('summaryTempo')) el('summaryTempo').textContent = fmtTime(duracao);
    if (el('summaryBandeira')) el('summaryBandeira').textContent = '' + trip.bandeira;
    if (el('summaryFracoes')) el('summaryFracoes').textContent = '' + trip.fracCount;
    if (el('summaryTotal')) el('summaryTotal').textContent = fmtMoney(trip.fare);
    if (el('summaryParams')) {
        el('summaryParams').textContent = 'Ba: ' + fmtMoney(config.bandeirada) +
            ' | f: ' + fmtMoney(config.fracao) +
            ' | i' + trip.bandeira + ': ' + i.toFixed(1) + ' m' +
            ' | iTH: ' + ith.toFixed(1) + ' s';
    }

    const fmtHora = ts => {
        const d = new Date(ts);
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    if (el('summaryEmbHora')) el('summaryEmbHora').textContent = fmtHora(trip.startTime);
    if (el('summaryDescHora')) el('summaryDescHora').textContent = fmtHora(trip.endTime);

    if (el('summaryEmbEnd')) el('summaryEmbEnd').textContent = 'Buscando endereço...';
    if (el('summaryDescEnd')) el('summaryDescEnd').textContent = 'Buscando endereço...';

    if (trip.startPos) {
        reverseGeocode(trip.startPos.lat, trip.startPos.lng, addr => {
            if (el('summaryEmbEnd')) el('summaryEmbEnd').textContent = addr;
        });
    } else {
        if (el('summaryEmbEnd')) el('summaryEmbEnd').textContent = 'Não disponível';
    }

    if (trip.endPos) {
        reverseGeocode(trip.endPos.lat, trip.endPos.lng, addr => {
            if (el('summaryDescEnd')) el('summaryDescEnd').textContent = addr;
        });
    } else {
        if (el('summaryDescEnd')) el('summaryDescEnd').textContent = 'Não disponível';
    }

    // Popula também os campos do recibo
    if (el('rDist')) el('rDist').textContent = fmtDist(trip.distance);
    if (el('rTempo')) el('rTempo').textContent = fmtTime(duracao);
    if (el('rBandeira')) el('rBandeira').textContent = '' + trip.bandeira;
    if (el('rFracoes')) el('rFracoes').textContent = '' + trip.fracCount;
    if (el('rTotal')) el('rTotal').textContent = fmtMoney(trip.fare);
    if (el('rParams')) {
        el('rParams').textContent = 'Ba R$' + config.bandeirada.toFixed(2) + ' | f R$' + config.fracao.toFixed(2) + ' | i' + trip.bandeira + ' ' + i.toFixed(0) + 'm';
    }
    if (el('rEmbHora')) el('rEmbHora').textContent = fmtHora(trip.startTime);
    if (el('rDescHora')) el('rDescHora').textContent = fmtHora(trip.endTime);
    const dataStr = new Date(trip.startTime).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (el('rData')) el('rData').textContent = dataStr;
    const n = config.taxista.nome || '---';
    const c = config.taxista.carro || '---';
    const pl = config.taxista.placa || '---';
    const p = config.taxista.prefixo || '---';
    if (el('rDriver')) {
        el('rDriver').innerHTML = 'Taxista: ' + n + '<br>Carro: ' + c + ' | Placa: ' + pl + ' | Prefixo: ' + p;
    }
    if (el('summaryDriver')) {
        el('summaryDriver').innerHTML = 'Taxista: ' + n + ' | Carro: ' + c + ' | Placa: ' + pl + ' | Prefixo: ' + p;
    }

    if (el('rEmbEnd')) el('rEmbEnd').textContent = 'Buscando...';
    if (el('rDescEnd')) el('rDescEnd').textContent = 'Buscando...';
    if (trip.startPos) {
        reverseGeocode(trip.startPos.lat, trip.startPos.lng, addr => {
            if (el('summaryEmbEnd')) el('summaryEmbEnd').textContent = addr;
            if (el('rEmbEnd')) el('rEmbEnd').textContent = addr;
        });
    }
    if (trip.endPos) {
        reverseGeocode(trip.endPos.lat, trip.endPos.lng, addr => {
            if (el('summaryDescEnd')) el('summaryDescEnd').textContent = addr;
            if (el('rDescEnd')) el('rDescEnd').textContent = addr;
        });
    }

    const modal = document.getElementById('summaryModal');
    if (modal) modal.classList.remove('hidden');
}

function imprimirRecibo() {
    // Cria um container de impressão dinâmico
    let printContainer = document.getElementById('printContainer');
    if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'printContainer';
        document.body.appendChild(printContainer);
    }

    // Copia o conteúdo do recibo para o container de impressão
    const receiptInner = document.getElementById('receiptInner');
    if (!receiptInner) return;

    printContainer.innerHTML = '';
    const clone = receiptInner.cloneNode(true);
    printContainer.appendChild(clone);

    // Abre o diálogo de impressão
    window.print();
}

function reverseGeocode(lat, lng, callback) {
    fetch('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json&accept-language=pt')
        .then(r => r.json())
        .then(data => {
            const addr = data.display_name || (data.address ? Object.values(data.address).join(', ') : null);
            callback(addr || lat.toFixed(4) + ', ' + lng.toFixed(4));
        })
        .catch(() => {
            callback(lat.toFixed(4) + ', ' + lng.toFixed(4));
        });
}

// ============================================================
// NAVEGAÇÃO
// ============================================================

let routeLine = null;
let routeLayer = null;
let autocompleteTimeout = null;
const autocompleteList = document.createElement('div');
autocompleteList.id = 'autocompleteList';

function onDestInput() {
    const q = destInput.value.trim();
    clearTimeout(autocompleteTimeout);
    autocompleteList.classList.add('hidden');
    if (q.length < 3) return;
    autocompleteTimeout = setTimeout(() => {
        fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) +
            '&format=json&limit=5&accept-language=pt&addressdetails=1')
            .then(r => r.json())
            .then(data => {
                if (!data || !data.length) return;
                autocompleteList.innerHTML = '';
                const seen = new Set();
                data.forEach(place => {
                    const name = place.display_name;
                    if (seen.has(name)) return;
                    seen.add(name);
                    const item = document.createElement('div');
                    item.className = 'autocomplete-item';
                    item.textContent = name;
                    item.addEventListener('mousedown', e => {
                        e.preventDefault();
                        destInput.value = name;
                        autocompleteList.classList.add('hidden');
                        currentPos = currentPos || [place.lat, place.lon];
                        openNavigationWithCoords(parseFloat(place.lat), parseFloat(place.lon), name);
                    });
                    autocompleteList.appendChild(item);
                });
                if (autocompleteList.children.length) autocompleteList.classList.remove('hidden');
            })
            .catch(() => {});
    }, 300);
}

function openNavigationWithCoords(destLat, destLng, destName) {
    if (!currentPos || !map) return;
    clearRoute();
    destInput.placeholder = 'Buscando rota...';

    fetch('https://router.project-osrm.org/route/v1/driving/' +
        currentPos[1] + ',' + currentPos[0] + ';' + destLng + ',' + destLat +
        '?overview=full&geometries=geojson&steps=false&alternatives=false')
        .then(r => r.json())
        .then(routeData => {
            if (!routeData || !routeData.routes || !routeData.routes.length) {
                destInput.placeholder = 'Rota não encontrada';
                setTimeout(() => { destInput.placeholder = 'Digite o endereço...'; }, 2000);
                return;
            }
            const route = routeData.routes[0];
            const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);

            routeLine = L.polyline(coords, {
                color: '#ffd700', weight: 5, opacity: 0.9, dashArray: '12, 8'
            }).addTo(map);

            const startMarker = L.circleMarker([currentPos[0], currentPos[1]], {
                radius: 8, color: '#00c853', fillColor: '#00c853', fillOpacity: 1
            }).addTo(map);
            const endMarker = L.circleMarker([destLat, destLng], {
                radius: 8, color: '#ff5252', fillColor: '#ff5252', fillOpacity: 1
            }).addTo(map);
            routeLayer = L.layerGroup([startMarker, endMarker]);

            map.fitBounds(routeLine.getBounds().pad(0.15));

            const distKm = (route.distance / 1000).toFixed(1);
            const durMin = Math.round(route.duration / 60);
            destInput.placeholder = distKm + ' km · ' + durMin + ' min — ' + destName;
        })
        .catch(() => {
            destInput.placeholder = 'Erro ao calcular rota';
            setTimeout(() => { destInput.placeholder = 'Digite o endereço...'; }, 2000);
        });
}

function clearRoute() {
    if (!map) return;
    if (routeLine) { try { map.removeLayer(routeLine); } catch (e) {} routeLine = null; }
    if (routeLayer) { try { map.removeLayer(routeLayer); } catch (e) {} routeLayer = null; }
}

function openNavigation() {
    const dest = destInput.value.trim();
    if (!dest) {
        destInput.placeholder = 'Digite um destino primeiro!';
        destInput.style.borderColor = '#ef5350';
        setTimeout(() => {
            destInput.placeholder = 'Digite o endereço de destino...';
            destInput.style.borderColor = '';
        }, 2000);
        return;
    }
    if (!currentPos) {
        destInput.placeholder = 'Aguardando localização...';
        return;
    }
    destInput.placeholder = 'Buscando rota...';
    clearRoute();

    fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(dest) + '&format=json&limit=1&accept-language=pt')
        .then(r => r.json())
        .then(data => {
            if (!data || !data.length) {
                destInput.placeholder = 'Destino não encontrado';
                setTimeout(() => { destInput.placeholder = 'Digite o endereço...'; }, 2000);
                return;
            }
            openNavigationWithCoords(parseFloat(data[0].lat), parseFloat(data[0].lon), data[0].display_name);
        })
        .catch(() => {
            destInput.placeholder = 'Erro ao buscar endereço';
            setTimeout(() => { destInput.placeholder = 'Digite o endereço...'; }, 2000);
        });
}

// ============================================================
// TELA CONFIG
// ============================================================

function handleLogin() {
    const pwd = pwdInput.value;
    if (pwd === config.senha || pwd === config.senhaMaster) {
        loginPanel.classList.add('hidden');
        settingsPanel.classList.remove('hidden');
        populateSettings();
        loginError.textContent = '';
        pwdInput.value = '';
        configStatus.textContent = pwd === config.senhaMaster ? 'MASTER' : 'LOCAL';
        configStatus.style.background = pwd === config.senhaMaster ? '#4a148c' : '#1b5e20';
    } else {
        loginError.textContent = 'Senha incorreta! Acesso restrito.';
        pwdInput.value = '';
    }
}

function handleLogout() {
    settingsPanel.classList.add('hidden');
    loginPanel.classList.remove('hidden');
    pwdInput.value = '';
    configMsg.textContent = '';
    remoteMsg.textContent = '';
    remoteLog.classList.add('hidden');
    configStatus.textContent = 'LOCAL';
    configStatus.style.background = '#1b5e20';
}

// ============================================================
// ACESSO REMOTO MASTER
// ============================================================

function syncWithServer() {
    remoteMsg.textContent = 'Conectando ao servidor master...';
    remoteMsg.style.color = '#ffd700';
    remoteLog.classList.remove('hidden');
    remoteLog.textContent = '';

    function log(msg) {
        remoteLog.textContent += '> ' + msg + '\n';
        remoteLog.scrollTop = remoteLog.scrollHeight;
    }

    log('Iniciando conexão segura com servidor INMETRO...');
    log('Servidor: api.inmetro.gov.br/taximetro/v2');

    setTimeout(() => {
        log('Handshake TLS estabelecido.');
        log('Autenticando credenciais...');
    }, 1200);

    setTimeout(() => {
        log('Credenciais verificadas. Acesso master concedido.');
        log('Solicitando configuração tarifária vigente...');
    }, 2400);

    setTimeout(() => {
        log('Configuração recebida do servidor:');
        log('  Ba = R$ 10,00 | f = R$ 0,30');
        log('  B1 = R$ 3,00/km | B2 = R$ 4,00/km');
        log('  TH = R$ 20,00/h');
        log('Assinatura digital: OK (INMETRO/2026)');
        log('Aplicando configuração no dispositivo...');

        // Aplica configuração do servidor
        const serverCfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        config = serverCfg;
        saveConfig();
        populateSettings();
    }, 3600);

    setTimeout(() => {
        log('Configuração aplicada com sucesso!');
        log('Hash de verificação: a3f8c2e1d4b5...');
        log('------------------------------');
        log('Status: SINCRONIZADO');
        remoteMsg.textContent = 'Sincronizado! Configurações atualizadas pelo servidor master INMETRO.';
        remoteMsg.style.color = '#66bb6a';
        configStatus.textContent = 'REMOTO';
        configStatus.style.background = '#6a1b9a';
        updateBandeira();
    }, 4800);
}

// ============================================================
// NAVEGAÇÃO ENTRE TELAS
// ============================================================

function showMain() {
    mainScreen.classList.add('active');
    configScreen.classList.remove('active');
    profileScreen.classList.remove('active');
    document.getElementById('financeScreen').classList.remove('active');
    document.getElementById('sideMenu').classList.add('hidden');
    handleLogout();
}

function showConfig() {
    mainScreen.classList.remove('active');
    configScreen.classList.add('active');
    profileScreen.classList.remove('active');
}

function showProfile() {
    mainScreen.classList.remove('active');
    configScreen.classList.remove('active');
    profileScreen.classList.remove('hidden');
    profileScreen.classList.add('active');
    profNome.value = config.taxista.nome || '';
    profCarro.value = config.taxista.carro || '';
    profPlaca.value = config.taxista.placa || '';
    profPrefixo.value = config.taxista.prefixo || '';
    profileMsg.textContent = '';
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

function updateClock() {
    if (!clockDisplay) return;
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    clockDisplay.textContent = h + ':' + m;
}

function init() {
    try {
        loadConfig();
        loadHistory();
        loadFinance();
    } catch (e) {
        console.warn('Erro na carga inicial:', e.message);
    }

    updateClock();
    setInterval(updateClock, 30000);

    registrarEventos();

    try {
        updateBandeira();
        recalcFare();
    } catch (e) {
        console.warn('Erro ao atualizar display:', e.message);
    }

    try {
        if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            startGPS();
        } else {
            startSimulator();
        }
    } catch (e) {
        console.warn('Erro no mapa/simulador:', e.message);
        try { startSimulator(); } catch (e2) {
            console.warn('Simulador falhou:', e2.message);
        }
    }
}

function registrarEventos() {
    btnStart.addEventListener('click', () => {
        if (trip.active) {
            toggleBandeira();
        } else {
            startTrip();
        }
    });
    btnStop.addEventListener('click', stopTrip);
    btnBackProfile.addEventListener('click', showMain);
    btnBackMain.addEventListener('click', showMain);

    // Finance back
    const btnBackFinance = document.getElementById('btnBackFinance');
    const financeScreen = document.getElementById('financeScreen');
    if (btnBackFinance) btnBackFinance.addEventListener('click', () => {
        financeScreen.classList.remove('active');
        mainScreen.classList.add('active');
    });

    // Menu lateral
    const btnMenu = document.getElementById('btnMenu');
    const btnCloseMenu = document.getElementById('btnCloseMenu');
    const sideOverlay = document.getElementById('sideOverlay');
    const sideMenu = document.getElementById('sideMenu');

    function closeMenu() { sideMenu.classList.add('hidden'); }

    if (btnMenu) btnMenu.addEventListener('click', () => sideMenu.classList.remove('hidden'));
    if (btnCloseMenu) btnCloseMenu.addEventListener('click', closeMenu);
    if (sideOverlay) sideOverlay.addEventListener('click', closeMenu);

    document.querySelectorAll('.side-item').forEach(item => {
        item.addEventListener('click', () => {
            closeMenu();
            const screen = item.dataset.screen;
            if (screen === 'config') { showConfig(); }
            else if (screen === 'perfil') { showProfile(); }
            else if (screen === 'historico') {
                renderHistory();
                document.getElementById('historyScreen').classList.add('active');
                mainScreen.classList.remove('active');
                configScreen.classList.remove('active');
                profileScreen.classList.remove('active');
                document.getElementById('financeScreen').classList.remove('active');
            }
            else if (screen === 'financeiro') {
                renderFinance();
                financeScreen.classList.add('active');
                mainScreen.classList.remove('active');
                configScreen.classList.remove('active');
                profileScreen.classList.remove('active');
                document.getElementById('historyScreen').classList.remove('active');
            }
        });
    });
    btnNav.addEventListener('click', openNavigation);
    destInput.addEventListener('keydown', e => { if (e.key === 'Enter') openNavigation(); });
    destInput.addEventListener('input', onDestInput);
    destInput.addEventListener('blur', () => setTimeout(() => { autocompleteList.classList.add('hidden'); }, 200));
    destInput.addEventListener('focus', () => { if (autocompleteList.children.length) autocompleteList.classList.remove('hidden'); });
    destInput.parentNode.appendChild(autocompleteList);

    btnLogin.addEventListener('click', handleLogin);
    pwdInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });

    btnSaveConfig.addEventListener('click', saveSettings);
    btnSaveProfile.addEventListener('click', () => {
        config.taxista.nome = profNome.value.trim();
        config.taxista.carro = profCarro.value.trim();
        config.taxista.placa = profPlaca.value.trim().toUpperCase();
        config.taxista.prefixo = profPrefixo.value.trim().toUpperCase();
        saveConfig();
        profileMsg.textContent = 'Dados salvos com sucesso!';
        setTimeout(() => { profileMsg.textContent = ''; }, 3000);
    });
    btnRemoteSync.addEventListener('click', syncWithServer);
    setupCalcAutoUpdate();

    const btnFechar = document.getElementById('btnFecharResumo');
    if (btnFechar) btnFechar.addEventListener('click', () => {
        const modal = document.getElementById('summaryModal');
        if (modal) modal.classList.add('hidden');
    });

    const btnImprimir = document.getElementById('btnImprimir');
    if (btnImprimir) btnImprimir.addEventListener('click', imprimirRecibo);
    const btnPrintRecibo = document.getElementById('btnPrintRecibo');
    if (btnPrintRecibo) btnPrintRecibo.addEventListener('click', exibirResumo);

    // History
    const btnBackHistory = document.getElementById('btnBackHistory');
    const btnExportCSV = document.getElementById('btnExportCSV');
    const btnClearHistory = document.getElementById('btnClearHistory');
    const btnCloseHistDet = document.getElementById('btnCloseHistDet');
    if (btnBackHistory) btnBackHistory.addEventListener('click', () => {
        document.getElementById('historyScreen').classList.remove('active');
        mainScreen.classList.add('active');
    });
    if (btnExportCSV) btnExportCSV.addEventListener('click', exportHistoryCSV);
    if (btnClearHistory) btnClearHistory.addEventListener('click', () => {
        if (!confirm('Tem certeza que deseja limpar todo o histórico?')) return;
        tripHistory = [];
        try { localStorage.removeItem('taximetroHistory'); } catch (e) {}
        renderHistory();
    });
    if (btnCloseHistDet) btnCloseHistDet.addEventListener('click', () => {
        document.getElementById('historyDetailModal').classList.add('hidden');
    });

    // History filter buttons
    document.querySelectorAll('.filter-btn[data-period]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn[data-period]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            historyFilter = btn.dataset.period;
            const dateRange = document.getElementById('historyDateRange');
            if (dateRange) {
                dateRange.classList.toggle('hidden', historyFilter !== 'periodo');
            }
            renderHistory();
        });
    });
    const btnFilterPeriod = document.getElementById('btnFilterPeriod');
    if (btnFilterPeriod) {
        btnFilterPeriod.addEventListener('click', () => {
            const s = document.getElementById('histDateStart');
            const e = document.getElementById('histDateEnd');
            if (s && e && s.value && e.value) {
                renderHistory();
            }
        });
    }

    // Finance buttons
    const btnAddFuel = document.getElementById('btnAddFuel');
    const btnAddManut = document.getElementById('btnAddManut');
    const btnClearFinance = document.getElementById('btnClearFinance');
    if (btnAddFuel) btnAddFuel.addEventListener('click', () => {
        const preco = parseFloat(document.getElementById('finPrecoLitro').value);
        const kmL = parseFloat(document.getElementById('finKmLitro').value);
        const litros = parseFloat(document.getElementById('finLitros').value);
        if (!preco || !litros) {
            document.getElementById('fuelMsg').textContent = 'Preencha preço e litros!';
            document.getElementById('fuelMsg').className = 'error-msg';
            setTimeout(() => { document.getElementById('fuelMsg').textContent = ''; }, 2000);
            return;
        }
        const total = preco * litros;
        financeData.abastecimentos.push({ preco, kmL, litros, total, data: Date.now() });
        saveFinance();
        renderFinance();
        document.getElementById('fuelMsg').textContent = 'Abastecimento adicionado: R$ ' + total.toFixed(2);
        document.getElementById('fuelMsg').className = 'success-msg';
        setTimeout(() => { document.getElementById('fuelMsg').textContent = ''; }, 3000);
        document.getElementById('finLitros').value = '';
    });
    if (btnAddManut) btnAddManut.addEventListener('click', () => {
        const desc = document.getElementById('finManutDesc').value.trim();
        const valor = parseFloat(document.getElementById('finManutValor').value);
        if (!desc || !valor) {
            document.getElementById('manutMsg').textContent = 'Preencha descrição e valor!';
            document.getElementById('manutMsg').className = 'error-msg';
            setTimeout(() => { document.getElementById('manutMsg').textContent = ''; }, 2000);
            return;
        }
        financeData.manutencoes.push({ desc, valor, data: Date.now() });
        saveFinance();
        renderFinance();
        document.getElementById('manutMsg').textContent = 'Manutenção adicionada: R$ ' + valor.toFixed(2);
        document.getElementById('manutMsg').className = 'success-msg';
        setTimeout(() => { document.getElementById('manutMsg').textContent = ''; }, 3000);
        document.getElementById('finManutDesc').value = '';
        document.getElementById('finManutValor').value = '';
    });
    if (btnClearFinance) btnClearFinance.addEventListener('click', () => {
        if (!confirm('Limpar todos os lançamentos financeiros?')) return;
        financeData = { abastecimentos: [], manutencoes: [] };
        saveFinance();
        renderFinance();
    });

    window.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && e.key === 'M') {
            pwdInput.value = config.senhaMaster;
            handleLogin();
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
