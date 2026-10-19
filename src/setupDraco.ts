import { useGLTF } from '@react-three/drei'

/** 必須在任何 useGLTF.preload 之前執行，冒險者 GLB 仍可能用 Draco。 */
useGLTF.setDecoderPath('/draco/')
