/**
 * 房間內 mesh 語音：用 Socket.io 當信令，WebRTC 直連（免費、免第三方帳號）
 */
import type { Socket } from 'socket.io-client'
import { getSocket } from './socket'

type SignalPayload =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit }

const peers = new Map<string, RTCPeerConnection>()
const remoteAudio = new Map<string, HTMLAudioElement>()
let localStream: MediaStream | null = null
let micEnabled = false
let selfId: string | null = null
let boundSocket: Socket | null = null

const ICE: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

function ensureAudioEl(peerId: string) {
  let el = remoteAudio.get(peerId)
  if (!el) {
    el = new Audio()
    el.autoplay = true
    el.setAttribute('playsinline', 'true')
    remoteAudio.set(peerId, el)
  }
  return el
}

async function getMic() {
  if (!localStream) {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    })
  }
  return localStream
}

function attachLocalTracks(pc: RTCPeerConnection) {
  if (!localStream) return
  for (const track of localStream.getTracks()) {
    const existing = pc.getSenders().find((s) => s.track?.kind === track.kind)
    if (existing) {
      void existing.replaceTrack(track)
    } else {
      pc.addTrack(track, localStream)
    }
  }
}

function createPc(peerId: string) {
  const existing = peers.get(peerId)
  if (existing) {
    if (existing.connectionState === 'failed' || existing.connectionState === 'closed' || existing.connectionState === 'disconnected') {
      cleanupPeer(peerId)
    } else {
      return existing
    }
  }

  const pc = new RTCPeerConnection(ICE)
  peers.set(peerId, pc)

  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return
    getSocket()?.emit('voice:signal', {
      to: peerId,
      data: { type: 'ice', candidate: ev.candidate.toJSON() } satisfies SignalPayload,
    })
  }

  pc.ontrack = (ev) => {
    const el = ensureAudioEl(peerId)
    el.srcObject = ev.streams[0]
    void el.play().catch(() => {})
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      cleanupPeer(peerId)
    }
  }

  if (micEnabled && localStream) attachLocalTracks(pc)
  return pc
}

async function callPeer(peerId: string) {
  if (!selfId || peerId === selfId) return
  const pc = createPc(peerId)
  if (pc.signalingState !== 'stable') return
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  getSocket()?.emit('voice:signal', {
    to: peerId,
    data: { type: 'offer', sdp: offer } satisfies SignalPayload,
  })
}

async function handleSignal(from: string, data: SignalPayload) {
  const pc = createPc(from)
  if (data.type === 'offer') {
    if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
      return
    }
    if (pc.signalingState === 'have-local-offer') {
      await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit).catch(() => {})
    }
    await pc.setRemoteDescription(data.sdp)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    getSocket()?.emit('voice:signal', {
      to: from,
      data: { type: 'answer', sdp: answer } satisfies SignalPayload,
    })
  } else if (data.type === 'answer') {
    if (pc.signalingState === 'have-local-offer') {
      await pc.setRemoteDescription(data.sdp)
    }
  } else if (data.type === 'ice') {
    try {
      await pc.addIceCandidate(data.candidate)
    } catch {
      /* ignore */
    }
  }
}

function cleanupPeer(peerId: string) {
  const pc = peers.get(peerId)
  if (pc) {
    pc.onicecandidate = null
    pc.ontrack = null
    pc.onconnectionstatechange = null
    pc.close()
  }
  peers.delete(peerId)
  const el = remoteAudio.get(peerId)
  if (el) {
    el.pause()
    el.srcObject = null
    remoteAudio.delete(peerId)
  }
}

function bindSocket(socket: Socket) {
  if (boundSocket === socket) return
  unbindSocket()
  boundSocket = socket
  socket.on('voice:signal', (payload: { from: string; data: SignalPayload }) => {
    void handleSignal(payload.from, payload.data)
  })
  socket.on('voice:peer-joined', ({ id }: { id: string }) => {
    if (selfId && selfId < id) void callPeer(id)
  })
  socket.on('voice:peer-left', ({ id }: { id: string }) => cleanupPeer(id))
}

function unbindSocket() {
  if (!boundSocket) return
  boundSocket.off('voice:signal')
  boundSocket.off('voice:peer-joined')
  boundSocket.off('voice:peer-left')
  boundSocket = null
}

export function startVoiceSession(myId: string, peerIds: string[]) {
  selfId = myId
  const socket = getSocket()
  if (socket) bindSocket(socket)

  for (const id of [...peers.keys()]) {
    if (id === myId || !peerIds.includes(id)) cleanupPeer(id)
  }

  for (const id of peerIds) {
    if (selfId && selfId < id && !peers.has(id)) void callPeer(id)
  }
}

/** 連線身分沒變、但 WebRTC 已死時，清掉舊 peer 再打一次。 */
export function restartVoiceSession(myId: string, peerIds: string[]) {
  for (const id of [...peers.keys()]) cleanupPeer(id)
  startVoiceSession(myId, peerIds)
}

export async function setMicEnabled(on: boolean) {
  micEnabled = on
  if (on) {
    const stream = await getMic()
    for (const track of stream.getAudioTracks()) track.enabled = true
    for (const pc of peers.values()) attachLocalTracks(pc)
  } else if (localStream) {
    for (const track of localStream.getAudioTracks()) track.enabled = false
  }
  return micEnabled
}

export function isMicEnabled() {
  return micEnabled
}

export function stopVoiceSession() {
  unbindSocket()
  for (const id of [...peers.keys()]) cleanupPeer(id)
  if (localStream) {
    for (const t of localStream.getTracks()) t.stop()
    localStream = null
  }
  micEnabled = false
  selfId = null
}
