import { Room, RoomEvent, createLocalTracks, VideoPresets } from 'livekit-client';

const qs = new URLSearchParams(location.search);
const token = qs.get('token');                      // obrigatório
const ws = qs.get('ws') || qs.get('serverUrl');     // opcional (no Cloud pode omitir)

const statusEl = document.getElementById('status');
const localEl  = document.getElementById('local');
const remoteEl = document.getElementById('remote');
const btnMute  = document.getElementById('btnMute');
const btnCam   = document.getElementById('btnCam');
const btnLeave = document.getElementById('btnLeave');

const setStatus = (t) => { statusEl.textContent = t; console.log('[PSII]', t); };

let room;
let micOn = true, camOn = true;

(async () => {
  if (!token) { setStatus('Token ausente na URL (?token=...)'); return; }

  try {
    room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    room.on(RoomEvent.TrackSubscribed, (_track, pub) => {
      if (pub?.track && pub.track.attachedElements?.length === 0) {
        pub.track.attach(remoteEl);
      }
    });
    room.on(RoomEvent.Disconnected, () => setStatus('Desconectado.'));

    setStatus('Conectando à sala…');
    await room.connect(ws || undefined, token);

    const tracks = await createLocalTracks({
      audio: true,
      video: VideoPresets.h720, // use h540 para mobile se precisar
    });
    for (const t of tracks) {
      await room.localParticipant.publishTrack(t);
      if (t.kind === 'video') t.attach(localEl);
    }

    setStatus('Conectado: ' + room.name);
  } catch (e) {
    setStatus('Erro: ' + (e?.message || e));
    console.error(e);
  }
})();

btnMute.onclick = async () => {
  if (!room) return;
  micOn = !micOn;
  await room.localParticipant.setMicrophoneEnabled(micOn);
  btnMute.textContent = micOn ? 'Mute' : 'Unmute';
};
btnCam.onclick = async () => {
  if (!room) return;
  camOn = !camOn;
  await room.localParticipant.setCameraEnabled(camOn);
  btnCam.textContent = camOn ? 'Cam' : 'Cam Off';
};
btnLeave.onclick = async () => {
  try { await room?.disconnect(); } catch(_) {}
  history.back();
};
