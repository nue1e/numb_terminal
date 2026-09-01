'use client';

import * as THREE from 'three';
import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';

const vertexShader = `
  varying vec2 vUv;
  uniform vec2 uScale;
  
  void main() {
    // Multiply the uv by uScale to fix the squishing and maintain perfect squares
    vUv = uv * uScale; 
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec2 uScale;
  varying vec2 vUv;

  void main() {
    // 1. INFINITE PANNING
    vec2 panningUv = vUv + vec2(uTime * 0.05, uTime * 0.03);
    
    // 2. TRUE MOUSE WARP
    // Map the -1 to 1 global mouse coordinates into our scaled 3D plane space.
    // The plane is 2x the viewport size, so the visible screen spans from UV 0.25 to 0.75.
    vec2 planeMouseUv = vec2(0.5 + (uMouse.x * 0.25), 0.5 + (uMouse.y * 0.25));
    
    // Multiply by uScale so it matches vUv's coordinate system perfectly
    vec2 trueMouse = planeMouseUv * uScale;

    // Compare the true global vUv to the true scaled mouse position
    float dist = distance(vUv, trueMouse);
    
    // Increased the warp radius (1.5) since we are working in scaled world space now
    float warpEffect = smoothstep(1.5, 0.0, dist) * 0.15;
    vec2 mouseWarp = normalize(vUv - trueMouse) * warpEffect;

    // Add warp to the panning UV, THEN fract to create the repeating grid tiles
    vec2 finalUv = fract(panningUv + mouseWarp);
    
    vec4 texColor = texture2D(uTexture, finalUv);
    
    // 3. DIM THE Polys
    vec3 tint = vec3(0.25, 0.25, 0.25); 
    
    gl_FragColor = vec4(texColor.rgb * tint, 1.0);
  }
`;

export default function GridBackground() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();
  
  const texture = useTexture('./assets/grid.webp') as THREE.Texture;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

  // Initialize mouse off-screen so the warp doesn't start in the dead center
  const targetMouse = useRef(new THREE.Vector2(999.0, 999.0));
  const currentMouse = useRef(new THREE.Vector2(999.0, 999.0));

  const scale = useMemo(() => {
    const zoomLevel = 1.2; 
    
    return new THREE.Vector2(
      (viewport.width / viewport.height) * zoomLevel, 
      1.0 * zoomLevel
    );
  }, [viewport.width, viewport.height]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      
      // state.pointer tracks the mouse globally regardless of what HTML is in front of it.
      // It returns values from -1 to 1.
      targetMouse.current.set(state.pointer.x, state.pointer.y);
      currentMouse.current.lerp(targetMouse.current, 0.05);
      
      materialRef.current.uniforms.uMouse.value = currentMouse.current;
    }
  });

  return (
    <mesh position={[0, 0, -2]}>
      {/* Plane is 2x the viewport to ensure corners don't clip while panning */}
      <planeGeometry args={[viewport.width * 2, viewport.height * 2, 32, 32]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          uTexture: { value: texture },
          uTime: { value: 0.0 },
          uMouse: { value: new THREE.Vector2(999.0, 999.0) },
          uScale: { value: scale }
        }}
        depthWrite={false}
      />
    </mesh>
  );
}