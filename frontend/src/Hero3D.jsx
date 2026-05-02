import React, { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Float, Sphere, Torus, MeshDistortMaterial } from '@react-three/drei'

function FloatingShapes() {
  const group = useRef()
  
  useFrame((state) => {
    group.current.rotation.y = state.clock.elapsedTime * 0.1
    group.current.rotation.z = state.clock.elapsedTime * 0.05
  })

  return (
    <group ref={group}>
      <Float speed={1.5} rotationIntensity={1} floatIntensity={2}>
        <Sphere args={[1.2, 64, 64]} position={[-4, 1.5, -2]}>
          <MeshDistortMaterial 
            color="#2DD4BF" 
            envMapIntensity={1} 
            clearcoat={1} 
            clearcoatRoughness={0.1} 
            metalness={0.5} 
            roughness={0.2} 
            distort={0.4} 
            speed={2} 
          />
        </Sphere>
      </Float>
      <Float speed={2} rotationIntensity={1.5} floatIntensity={1.5}>
        <Torus args={[0.9, 0.3, 32, 100]} position={[4, -1.5, -1]} rotation={[Math.PI / 4, 0, 0]}>
          <meshPhysicalMaterial 
            color="#FF6B35" 
            transmission={0.9} 
            opacity={1} 
            metalness={0.1} 
            roughness={0.1} 
            ior={1.5} 
            thickness={0.5} 
          />
        </Torus>
      </Float>
      <Float speed={1} rotationIntensity={0.5} floatIntensity={1}>
        <Sphere args={[0.6, 32, 32]} position={[0, 3, -5]}>
          <meshStandardMaterial color="#FFF4F0" metalness={0.8} roughness={0.2} />
        </Sphere>
      </Float>
    </group>
  )
}

export default function Hero3D() {
  return (
    <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.35]">
      <Canvas camera={{ position: [0, 0, 8], fov: 45 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 5]} intensity={1.5} color="#ffffff" />
        <directionalLight position={[-10, -10, -5]} intensity={0.5} color="#2DD4BF" />
        <Environment preset="city" />
        <FloatingShapes />
      </Canvas>
    </div>
  )
}
