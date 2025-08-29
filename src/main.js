// src/main.js
import {
  Room,
  RoomEvent,
  createLocalTracks,
  VideoPresets,
  DataPacket_Kind,
} from 'livekit-client';

// ──────────────────────────────────────────────────────────────
// query params (token obrigatório; ws opcional no LiveKit Cloud)
const qs   = new URLSearchParams(location.search);
const token = qs.get('token');                      // JWT do participante
const ws    = qs.get('ws') || qs.get('serverUrl');  // wss://... (opcional)

// refs da UI
const statusEl  = document.getElementById('status');
const localEl   = document.getElementById('local');
const remoteEl  = document.getElementById('remote');
const btnMute   = document.getElementById('btnMute');
const btnCam    = document.getElementById('btnCam');
const btnLeave  = document.getElementById('btnLeave');

// CHAT
const messagesEl = document.getElementById('messages');
const chatForm   = document.getElementById('chatForm');
const chatInput  = document.getElementById('chatInput');

const enc = new TextEncoder();
const dec = new TextDecoder();

const setStatus = (t) => { statusEl.textContent = t; console.log('[PSII]', t); };

function addMessage({ from, text }, isMe = false) {
  if (!messagesEl) return;
  const wrap = document.createElement('div');
  wrap.className = 'msg' + (isMe ? ' me' : '');
  const name = document.createElement('div');
  name.className = 'from';
  name.textContent = isMe ? `${from} (você)` : from;
  const body = document.createElement('div');
  body.textContent = text;
  wrap.appendChild(name); wrap.appendChild(body);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function myName(room) {
  const lp = room.localParticipant;
  return lp?.name || lp?.identity || 'Você';
}

// ──────────────────────────────────────────────────────────────
// estado
let room;
let micOn = true;
let camOn = true;

// autojoin
(async () => {
  if (!token) { setStatus('Token ausente na URL (?token=...)'); return; }

  try {
    room = new Room({
      adaptiveStream: true,  // otimiza uso de banda no remoto
      dynacast: true,        // não envia cam em resoluções desnecessárias
    });

    // quando entrar/ sair
    room.on(RoomEvent.Connected,   () => setStatus('Conectado: ' + room.name));
    room.on(RoomEvent.Disconnected,() => setStatus('Desconectado.'));

    // quando receber track de vídeo remoto, anexa no <video id="remote">
    room.on(RoomEvent.TrackSubscribed, (_track, pub) => {
      if (pub?.track && pub.track.attachedElements?.length === 0) {
        try { pub.track.attach(remoteEl); } catch (_) {}
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (_track, _pub) => {
      // solta o elemento remoto se quiser; aqui deixamos o <video> quieto
    });

    // receber mensagens do chat (data channel)
    room.on(RoomEvent.DataReceived, (payload, participant /*, kind, topic */) => {
      try {
        const json = JSON.parse(dec.decode(payload));
        if (json?.text && json?.from) addMessage({ from: json.from, text: json.text }, false);
      } catch (e) {
        console.warn('Mensagem inválida', e);
      }
    });

    setStatus('Conectando à sala…');
    await room.connect(ws || undefined, token);

    // cria tracks locais (áudio+vídeo) e publica
    const tracks = await createLocalTracks({
      audio: true,
      video: VideoPresets.h720, // troque para h540 se quiser poupar CPU em mobile
    });
    for (const t of tracks) {
      await room.localParticipant.publishTrack(t);
      if (t.kind === 'video') {
        try { t.attach(localEl); } catch (_) {}
      }
    }

    setStatus('Conectado: ' + room.name);
  } catch (e) {
    setStatus('Erro: ' + (e?.message || e));
    console.error(e);
  }
})();

// ──────────────────────────────────────────────────────────────
// Controles básicos
btnMute?.addEventListener('click', async () => {
  if (!room) return;
  micOn = !micOn;
  await room.localParticipant.setMicrophoneEnabled(micOn);
  btnMute.textContent = micOn ? 'Mute' : 'Unmute';
});

btnCam?.addEventListener('click', async () => {
  if (!room) return;
  camOn = !camOn;
  await room.localParticipant.setCameraEnabled(camOn);
  btnCam.textContent = camOn ? 'Cam' : 'Cam Off';
});

btnLeave?.addEventListener('click', async () => {
  try { await room?.disconnect(); } catch(_) {}
  history.back(); // ou location.href = '...'
});

// ──────────────────────────────────────────────────────────────
// Chat: enviar mensagem
chatForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = (chatInput.value || '').trim();
  if (!text || !room) return;
  const msg = { from: myName(room), text, ts: Date.now() };
  try {
    await room.localParticipant.publishData(
      enc.encode(JSON.stringify(msg)),
      DataPacket_Kind.RELIABLE // garante entrega
    );
    addMessage(msg, true); // mostra para o remetente
    chatInput.value = '';
  } catch (err) {
    console.error('Falha ao enviar mensagem', err);
  }
});
