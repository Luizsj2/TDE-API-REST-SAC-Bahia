import './style.css';
import { createRouteMap } from './route-map.js';

const byId = id => document.getElementById(id);
const form = byId('route-form');
const reference = byId('reference');
const latitude = byId('latitude');
const longitude = byId('longitude');
const recommendButton = byId('recommend');
const refreshButton = byId('refresh');
const status = byId('service-status');
const routeStatus = byId('route-status');
const map = createRouteMap(byId('map'));
const distance = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
let postos = [];

async function api(path, options) {
    const response = await fetch('/web-api' + path, {
        ...options,
        signal: AbortSignal.timeout(6000),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || json === null) {
        throw new Error(json?.erro || 'O serviço está indisponível. Tente novamente.');
    }
    return json;
}

function setStatus(text, state) {
    status.className = 'service ' + state;
    status.textContent = text;
}

function showRouteStatus(message = '', error = false) {
    routeStatus.hidden = !message;
    routeStatus.textContent = message;
    routeStatus.classList.toggle('error', error);
}

function updateOrigin() {
    const posto = postos.find(item => item.id === reference.value);
    if (!posto) return;
    latitude.value = posto.latitude;
    longitude.value = posto.longitude;
}

function queueRow(name, detail, minutes) {
    const row = document.createElement('li');
    const title = document.createElement('span');
    title.textContent = name;
    if (detail) {
        const note = document.createElement('small');
        note.textContent = detail;
        title.append(note);
    }
    const time = document.createElement('strong');
    time.textContent = minutes + ' min';
    row.append(title, time);
    return row;
}

async function loadCatalog() {
    refreshButton.disabled = true;
    byId('retry').disabled = true;
    setStatus('Atualizando postos', 'loading');
    let firstLoad = false;
    try {
        const fresh = await api('/postos');
        if (!fresh.length) throw new Error('Nenhum posto disponível no catálogo.');
        firstLoad = postos.length === 0;
        const selected = reference.value;
        postos = fresh;
        reference.replaceChildren(...postos.map(posto => new Option(posto.posto, posto.id)));
        reference.value = postos.some(posto => posto.id === selected)
            ? selected : (postos.find(posto => posto.id === 'shopping_bahia') || postos[0]).id;
        byId('queue-list').replaceChildren(...postos.map(posto =>
            queueRow(posto.posto, '', posto.tempo_espera_minutos)));
        byId('catalog-error').hidden = true;
        reference.disabled = false;
        recommendButton.disabled = false;
        setStatus('API disponível', 'online');
        if (firstLoad) updateOrigin();
    } catch (error) {
        setStatus('API indisponível', 'offline');
        byId('catalog-message').textContent = error.message;
        byId('catalog-error').hidden = false;
    } finally {
        byId('retry').disabled = false;
        refreshButton.disabled = !postos.length;
    }
    if (firstLoad) await recommend();
}

function parseCoordinate(value) {
    const decimal = value.trim().replace(',', '.');
    return /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(decimal) ? Number(decimal) : NaN;
}

function showResult(result) {
    const { recomendado: best, alternativas, rota } = result;
    byId('route-intro').textContent = 'Trajeto demonstrativo calculado no corredor Salvador–Feira.';
    byId('best-name').textContent = best.posto;
    byId('best-total').textContent = best.total_minutos + ' min';
    byId('best-travel').textContent = best.viagem_minutos + ' min';
    byId('best-wait').textContent = best.tempo_espera_minutos + ' min';
    byId('best-distance').textContent = distance.format(best.distancia_km) + ' km';
    byId('alternative-list').replaceChildren(...alternativas.map(posto => queueRow(
        posto.posto, posto.viagem_minutos + ' min de viagem · ' + posto.tempo_espera_minutos + ' min de fila',
        posto.total_minutos,
    )));
    byId('alternatives').hidden = !alternativas.length;
    byId('result-details').hidden = false;
    byId('map-legend').hidden = false;
    map.setRoute(rota.geometria.coordinates, best.posto);
}

async function recommend(event) {
    event?.preventDefault();
    const lat = parseCoordinate(latitude.value);
    const lon = parseCoordinate(longitude.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        showRouteStatus('Informe uma latitude e uma longitude numéricas.', true);
        return;
    }
    recommendButton.disabled = true;
    showRouteStatus('Calculando rota…');
    try {
        const result = await api('/recomendacoes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitude: lat, longitude: lon }),
        });
        showResult(result);
        showRouteStatus('Recomendação atualizada.');
    } catch (error) {
        showRouteStatus(error.message, true);
    } finally {
        recommendButton.disabled = false;
    }
}

reference.addEventListener('change', updateOrigin);
form.addEventListener('submit', recommend);
refreshButton.addEventListener('click', loadCatalog);
byId('retry').addEventListener('click', loadCatalog);
loadCatalog();
