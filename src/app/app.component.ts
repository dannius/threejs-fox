import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as three from 'three';
import * as dat from 'dat.gui';

enum FoxAnimation {
  idle = 'idle',
  walk = 'walk',
  run = 'run',
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  @ViewChild('canvas', { static: true, read: ElementRef })
  public canvas: ElementRef;

  @HostListener('window:resize')
  public onResize() {
    this.setRendererSize();
    this.camera.aspect = this.aspectRatio;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  private lights: three.SpotLight[];

  private scene: three.Scene;
  private renderer: three.WebGLRenderer;
  private camera: three.PerspectiveCamera;
  private orbit: OrbitControls;

  private foxAnimationClips: Map<FoxAnimation, three.AnimationClip> | undefined = undefined;

  private dat = new dat.GUI();

  private glTFLoader = new GLTFLoader();
  private textureLoader = new three.TextureLoader();
  private cubeTextureLoader = new three.CubeTextureLoader();

  private plate: three.Mesh;

  private resourses = new Map<string, any>();

  private get foxResource(): three.Group & { scene: three.Scene } {
    return this.resourses.get('fox');
  }

  private get selectedAnimation(): three.AnimationClip | undefined {
    if (!this.debugger.selectedAnimationTitle) {
      return undefined;
    }

    return this.foxAnimationClips?.get(this.debugger.selectedAnimationTitle);
  }

  private animation: {
    mixer: three.AnimationMixer | undefined,
    action: three.AnimationAction | undefined,
  } = {
    mixer: undefined,
    action: undefined,
  }

  private debugger: {
    envMap: three.Texture | null,
    envIntensity: number,
    setNormal: boolean,
    selectedAnimationTitle: FoxAnimation | undefined,
    lightAngle: number,
    penumbra: number,
    lightIntensity: number,
  } = {
    envMap: null,
    envIntensity: 0.4,
    setNormal: true,
    selectedAnimationTitle: FoxAnimation.walk,
    lightAngle: Math.PI * 0.2,
    penumbra: 0.1,
    lightIntensity: 2,
  };

  private time = new three.Clock();

  private get sizes() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    }
  }

  private get aspectRatio(): number {
    return this.sizes.width / this.sizes.height;
  }

  private tick = () => {
    this.renderer.render(this.scene, this.camera);
    this.orbit.update();

    this.animation.mixer?.update(this.time.getDelta())

    window.requestAnimationFrame(this.tick);
  }

  public ngOnInit(): void {
    this.initRenderer();
    this.initScene();
    this.initCamera();

    this.createPlate();

    this.loadTextures().then(() => {
      // this.setEnvironmentMap(this.resourses.get('envMap'));
      this.setGrassTextures(this.resourses.get('floorColor'), this.resourses.get('floorNormal'));
      this.createFox();
    });

    this.createLights();

    this.createDatHelpers();
    this.tick();
  }

  private loadTextures(): Promise<void> {
    return new Promise((res) => {
      // const cubeTextures = [
      //   {
      //     name: 'envMap',
      //     paths: [
      //       '/assets/textures/environmentMap/px.jpg',
      //       '/assets/textures/environmentMap/nx.jpg',
      //       '/assets/textures/environmentMap/py.jpg',
      //       '/assets/textures/environmentMap/ny.jpg',
      //       '/assets/textures/environmentMap/pz.jpg',
      //       '/assets/textures/environmentMap/nz.jpg',
      //     ],
      //   },
      // ];

      const gltfTextures = [
        { name: 'fox', path: '/assets/models/Fox/glTF-Binary/Fox.glb' },
      ];

      const commonTextures = [
        { name: 'floorColor', path: 'assets/textures/dirt/color.jpg' },
        { name: 'floorNormal', path: 'assets/textures/dirt/normal.jpg' },
      ];

      const resourcesToLoad = gltfTextures.length + commonTextures.length;
      let resourcesLoaded = 0;

      let onLoadCallback = (name: string, texture: any) => {
        this.resourses.set(name, texture);
        resourcesLoaded += 1;

        if (resourcesLoaded === resourcesToLoad) {
          res();
        }
      }

      // cubeTextures.forEach(cube => {
      //   this.cubeTextureLoader.load(cube.paths, (texture) => onLoadCallback(cube.name, texture));
      // });

      gltfTextures.forEach(gltf => {
        this.glTFLoader.load(gltf.path, (texture) => onLoadCallback(gltf.name, texture));
      });

      commonTextures.forEach(common => {
        this.textureLoader.load(common.path, (texture) => onLoadCallback(common.name, texture));
      });
    });
  }

  private setGrassTextures(color: three.Texture, normal: three.Texture) {
    (this.plate.material as three.MeshStandardMaterial).map = color;

    if (this.debugger.setNormal) {
      (this.plate.material as three.MeshStandardMaterial).normalMap = normal;
    } else {
      (this.plate.material as three.MeshStandardMaterial).normalMap = null;
    }

    (this.plate.material as three.MeshStandardMaterial).needsUpdate = true;
  }

  // private setEnvironmentMap(envMap: three.CubeTexture): void  {
  //   this.debugger.envMap = envMap;
  //   this.debugger.envMap.encoding = three.sRGBEncoding;

  //   this.scene.environment = this.debugger.envMap;

  //   this.setEnvMap();
  // }

  private setEnvMap() {
    this.scene.traverse((child) => {
      if (child instanceof three.Mesh && child.material instanceof three.MeshStandardMaterial) {
        child.material.envMap = this.debugger.envMap;
        // child.material.envMapIntensity = this.debugger.envIntensity;
        child.material.needsUpdate = true;
      }
    });
  }

  private createDatHelpers() {
    // this.dat.add(this.debugger, 'envIntensity', 0.1, 3, 0.01).onChange(() => this.setEnvMap())
    this.dat.add(this.debugger, 'selectedAnimationTitle', { idle: FoxAnimation.idle, walking: FoxAnimation.walk, run: FoxAnimation.run } )
      .onChange((value) => {
        this.debugger.selectedAnimationTitle = value;
        this.setAnimationAction();
      });

    this.dat.add(this.debugger, 'lightIntensity', 0.01, 3, 0.01).onChange(intensity => {
      this.lights.forEach(spotlight => {
        spotlight.intensity = intensity;
      })
    })

    this.dat.add(this.debugger, 'lightAngle', 0.001, 1, 0.001).onChange(angle => {
      this.lights.forEach(spotlight => {
        spotlight.angle = angle;
      })
    })

    this.dat.add(this.debugger, 'penumbra', 0.001, 1, 0.001).onChange(penumbra => {
      this.lights.forEach(spotlight => {
        spotlight.penumbra = penumbra;
      })
    })
  }

  private createLights(): void {
    const spotlight1 = this.createShadowSpotlight();
    spotlight1.position.set(-3, 6, 4);

    const spotlight2 = this.createShadowSpotlight();
    spotlight2.position.set(2, 6, -3);

    const spotlight3 = this.createShadowSpotlight();
    spotlight3.position.set(4, 6, 2);

    // const spotlightHelper = new three.SpotLightHelper(spotlight1);
    // const spotlightShadowHelper = new three.CameraHelper(spotlight1.shadow.camera);

    const ambient = new three.AmbientLight(0x404040, 0.15);

    this.lights = [spotlight1, spotlight2, spotlight3];
    this.scene.add(spotlight1, spotlight2, spotlight3);
  }

  private createShadowSpotlight(): three.SpotLight {
    const spotlight = new three.SpotLight('#ffffff', this.debugger.lightIntensity, 12, this.debugger.lightAngle, this.debugger.penumbra);
    spotlight.castShadow = true;

    spotlight.shadow.mapSize.set(2048, 2048);
    spotlight.shadow.camera.far = 10;
    spotlight.shadow.camera.near = 1
    spotlight.shadow.camera.fov = 20;

    return spotlight;
  }

  private createPlate(): void {
    this.plate = new three.Mesh(
      new three.CircleBufferGeometry(6, 32),
      new three.MeshStandardMaterial({ color: '#9a9a9a' }),
    );

    this.plate.rotateX(-Math.PI * 0.5);

    this.plate.receiveShadow = true;

    this.scene.add(this.plate);
  }

  private createFox(): void {
    this.foxAnimationClips = new Map([
      [FoxAnimation.idle, this.foxResource.animations[0]],
      [FoxAnimation.walk, this.foxResource.animations[1]],
      [FoxAnimation.run, this.foxResource.animations[2]],
    ]);

    const model = this.foxResource;
    model.scene.scale.set(0.02, 0.02, 0.02);
    this.scene.add(model.scene);

    model.scene.traverse((child) => {
      child.castShadow = true;
    })

    this.setFoxAnimation();
  }

  private setFoxAnimation() {
    this.animation.mixer = new three.AnimationMixer(this.foxResource.scene);
    this.setAnimationAction();
  }

  private setAnimationAction() {
    if (this.animation.action) {
      this.animation.action.stop();
    }

    if (this.animation.mixer && this.selectedAnimation) {
      this.animation.action = this.animation.mixer.clipAction(this.selectedAnimation);
      this.animation.action.play();
    }
  }

  private initScene(): void {
    this.scene = new three.Scene();
  }

  private initCamera() {
    this.camera = new three.PerspectiveCamera(55, this.aspectRatio, 1, 100);
    this.camera.position.set(4, 5, 8);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;

    this.scene.add(this.camera);
  }

  private initRenderer(): void {
    this.renderer = new three.WebGLRenderer({ canvas: this.canvas.nativeElement });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = three.PCFSoftShadowMap;

    this.setRendererSize();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  private setRendererSize() {
    this.renderer.setSize(this.sizes.width, this.sizes.height);
  }
}
