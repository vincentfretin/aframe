/* global XRMediaBinding, XRRigidTransform, XRWebGLBinding */
import * as THREE from 'three';
import { registerComponent } from '../core/component.js';
import * as utils from '../utils/index.js';
var warn = utils.debug('components:layer:warn');

registerComponent('stereo', {
  schema: {
    eye: { type: 'string', default: 'left' },
    mode: { type: 'string', default: 'full' },
    split: { type: 'string', default: 'horizontal' },
    playOnClick: { type: 'boolean', default: true }
  },
  init: function () {
    // Flag to acknowledge if 'click' on video has been attached to canvas
    // Keep in mind that canvas is the last thing initialized on a scene so have to wait for the event
    // or just check in every tick if is not undefined

    this.video_click_event_added = false;

    this.material_is_a_video = false;

    // Check if material is a video from html tag (object3D.material.map instanceof THREE.VideoTexture does not
    // always work

    if (
      this.el.getAttribute('material') !== null &&
      'src' in this.el.getAttribute('material') &&
      this.el.getAttribute('material').src !== ''
    ) {
      const src = this.el.getAttribute('material').src;

      // If src is an object and its tagName is video...
      if (typeof src === 'object' && 'tagName' in src && src.tagName === 'VIDEO') {
        this.material_is_a_video = true;
      }
    }

    const object3D = this.el.getObject3D('mesh');
    const isValidGeometry = object3D.geometry instanceof THREE.SphereGeometry;

    if (isValidGeometry) {
      // if half-dome mode, rebuild geometry (with default 100, radius, 64 width segments and 64 height segments)

      let geoDef, geometry;
      if (this.data.mode === 'half') {
        geoDef = this.el.getAttribute('geometry');
        geometry = new THREE.SphereGeometry(
          geoDef.radius || 100,
          geoDef.segmentsWidth || 64,
          geoDef.segmentsHeight || 64,
          Math.PI / 2,
          Math.PI,
          0,
          Math.PI
        );
      } else {
        geoDef = this.el.getAttribute('geometry');
        geometry = new THREE.SphereGeometry(
          geoDef.radius || 100,
          geoDef.segmentsWidth || 64,
          geoDef.segmentsHeight || 64
        );
      }

      // Panorama in front

      object3D.rotation.y = Math.PI / 2;

      // Calculate texture offset and repeat and modify UV's
      // (cannot use in AFrame material params, since mappings are shared when pointing to the same texture,
      // thus, one eye overrides the other) -> https://stackoverflow.com/questions/16976365/two-meshes-same-texture-different-offset

      const axis = this.data.split === 'horizontal' ? 'y' : 'x';

      // If left eye is set, and the split is horizontal, take the left half of the video texture.
      // If the split is set to vertical, take the top/upper half of the video texture.
      // UV texture coordinates start at the bottom left point of the texture, so y axis coordinates for left eye on vertical split
      // are 0.5 - 1.0, and for the right eye are 0.0 - 0.5

      const offset =
        this.data.eye === 'left'
          ? axis === 'y'
            ? { x: 0, y: 0 }
            : { x: 0, y: 0.5 }
          : axis === 'y'
            ? { x: 0.5, y: 0 }
            : { x: 0, y: 0 };

      const repeat = axis === 'y' ? { x: 0.5, y: 1 } : { x: 1, y: 0.5 };

      const uvAttribute = geometry.attributes.uv;

      for (let i = 0; i < uvAttribute.count; i++) {
        const u = uvAttribute.getX(i) * repeat.x + offset.x;
        const v = uvAttribute.getY(i) * repeat.y + offset.y;

        uvAttribute.setXY(i, u, v);
      }

      // Needed in BufferGeometry to update UVs

      uvAttribute.needsUpdate = true;

      this.originalGeometry = object3D.geometry;
      object3D.geometry = geometry;

      // No need to attach video click if not a video
      this.video_click_event_added = !this.material_is_a_video;
    } else {
      // No need to attach video click if not a sphere
      this.video_click_event_added = true;
    }
  },

  remove: function () {
    const object3D = this.el.getObject3D('mesh');
    object3D.geometry.dispose();
    if (this.originalGeometry) {
      object3D.geometry = this.originalGeometry;
    }
  },

  // On element update, put in the right layer, 0:both, 1:left, 2:right (spheres or not)

  update: function () {
    const object3D = this.el.getObject3D('mesh');
    const data = this.data;

    if (data.eye === 'both') {
      object3D.layers.set(0);
    } else {
      object3D.layers.set(data.eye === 'left' ? 1 : 2);
    }
  },

  tick: function () {
    // If this value is false, it means that (a) this is a video on a sphere [see init method]
    // and (b) of course, tick is not added

    if (!this.video_click_event_added && this.data.playOnClick) {
      if (typeof this.el.sceneEl.canvas !== 'undefined') {
        // Get video DOM

        const object3D = this.el.getObject3D('mesh');
        this.videoEl = object3D.material.map.image;

        // On canvas click, play video element. Use self to not lose track of object into event handler

        const self = this;

        this.el.sceneEl.canvas.onclick = function () {
          self.videoEl.play();
        };

        // Signal that click event is added
        this.video_click_event_added = true;
      }
    }
  }
});

// Sets the 'default' eye viewed by camera in non-VR mode

registerComponent('stereocam', {
  schema: {
    eye: { type: 'string', default: 'left' }
  },

  // Cam is not attached on init, so use a flag to do this once at 'tick'

  // Use update every tick if flagged as 'not changed yet'

  init: function () {
    // Flag to register if cam layer has already changed
    this.layer_changed = false;
  },

  tick: function () {
    const originalData = this.data;

    // If layer never changed

    if (!this.layer_changed) {
      // because stereocam component should be attached to an a-camera element
      // need to get down to the root PerspectiveCamera before addressing layers

      // Gather the children of this a-camera and identify types

      const childrenTypes = [];

      this.el.object3D.children.forEach(function (item, index) {
        childrenTypes[index] = item.type;
      });

      // Retrieve the PerspectiveCamera
      const rootIndex = childrenTypes.indexOf('PerspectiveCamera');
      const rootCam = this.el.object3D.children[rootIndex];

      if (originalData.eye === 'both') {
        rootCam.layers.enable(1);
        rootCam.layers.enable(2);
      } else {
        rootCam.layers.enable(originalData.eye === 'left' ? 1 : 2);
      }
      this.layer_changed = true;
    }
  }
});

export var Component = registerComponent('layer', {
  schema: {
    type: {default: 'quad', oneOf: ['mono-equirect', 'stereo-left-right-equirect', 'stereo-top-bottom-equirect', 'quad', 'monocubemap', 'stereocubemap']},
    src: {type: 'map'},
    is180: {default: false, if: {type: ['mono-equirect', 'stereo-left-right-equirect', 'stereo-top-bottom-equirect']}},
    radius: {default: 198, if: {type: ['mono-equirect', 'stereo-left-right-equirect', 'stereo-top-bottom-equirect']}},
    rotateCubemap: {default: false},
    width: {default: 0},
    height: {default: 0}
  },

  init: function () {
    this.quaternion = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.layerEnabled = false;
    // From another component, set this.el.components.layer.needsRedraw = true
    // if you use a canvas as src and want to redraw the layer.
    this.needsRedraw = false;

    this.bindMethods();

    var webxrData = this.el.sceneEl.getAttribute('webxr');
    var requiredFeaturesArray = webxrData.requiredFeatures;
    var optionalFeaturesArray = webxrData.optionalFeatures;
    // Types monocubemap and stereocubemap currently don't have any fallback
    // so make the layers feature required. For other types make it optional
    // so the fallback is used on devices not supporting WebXR layers.
    if (this.data.type === 'monocubemap' || this.data.type === 'stereocubemap') {
      if (requiredFeaturesArray.indexOf('layers') === -1) {
        requiredFeaturesArray.push('layers');
        this.el.sceneEl.setAttribute('webxr', webxrData);
      }
    } else {
      if (optionalFeaturesArray.indexOf('layers') === -1) {
        optionalFeaturesArray.push('layers');
        this.el.sceneEl.setAttribute('webxr', webxrData);
      }
    }
    this.el.sceneEl.addEventListener('enter-vr', this.onEnterVR);
    this.el.sceneEl.addEventListener('exit-vr', this.onExitVR);
  },

  bindMethods: function () {
    this.onRequestedReferenceSpace = this.onRequestedReferenceSpace.bind(this);
    this.onEnterVR = this.onEnterVR.bind(this);
    this.onExitVR = this.onExitVR.bind(this);
  },

  update: function (oldData) {
    if (this.data.src !== oldData.src) { this.updateSrc(); }
  },

  updateSrc: function () {
    var type = this.data.type;
    this.destroyLayer();
    this.texture = undefined;
    this.textureIsVideo = this.data.src.tagName === 'VIDEO';
    if (type.endsWith('equirect')) {
      this.loadEquirectImage();
      return;
    }

    if (type === 'quad') {
      this.loadQuadImage();
      return;
    }

    if (type === 'monocubemap' || type === 'stereocubemap') {
      this.loadCubeMapImages();
      return;
    }
  },

  loadCubeMapImages: function () {
    var glayer;
    var xrGLFactory = this.xrGLFactory;
    var frame = this.el.sceneEl.frame;
    var src = this.data.src;
    var type = this.data.type;

    this.visibilityChanged = false;
    if (!this.layer) { return; }
    if (type !== 'monocubemap' && type !== 'stereocubemap') { return; }

    if (!src.complete) {
      this.pendingCubeMapUpdate = true;
    } else {
      this.pendingCubeMapUpdate = false;
    }

    if (!this.loadingScreen) {
      this.loadingScreen = true;
    } else {
      this.loadingScreen = false;
    }

    if (type === 'monocubemap') {
      glayer = xrGLFactory.getSubImage(this.layer, frame);
      this.loadCubeMapImage(glayer.colorTexture, src, 0);
    } else {
      glayer = xrGLFactory.getSubImage(this.layer, frame, 'left');
      this.loadCubeMapImage(glayer.colorTexture, src, 0);
      glayer = xrGLFactory.getSubImage(this.layer, frame, 'right');
      this.loadCubeMapImage(glayer.colorTexture, src, 6);
    }
  },

  loadEquirectImage: function () {
    var src = this.data.src;
    var self = this;
    this.el.sceneEl.systems.material.loadTexture(src, {src: src}, function textureLoaded (texture) {
      self.el.sceneEl.renderer.initTexture(texture);
      self.texture = texture;
      self.updateSpheres();
    });
  },

  loadQuadImage: function () {
    var src = this.data.src;
    var self = this;
    this.el.sceneEl.systems.material.loadTexture(src, {src: src}, function textureLoaded (texture) {
      self.el.sceneEl.renderer.initTexture(texture);
      self.texture = texture;
      self.updateQuadPanel();
    });
  },

  preGenerateCubeMapTextures: function (src, callback) {
    if (this.data.type === 'monocubemap') {
      this.generateCubeMapTextures(src, 0, callback);
    } else {
      this.generateCubeMapTextures(src, 0, callback);
      this.generateCubeMapTextures(src, 6, callback);
    }
  },

  generateCubeMapTextures: function (src, faceOffset, callback) {
    var data = this.data;
    var cubeFaceSize = this.cubeFaceSize;
    var textureSourceCubeFaceSize = Math.min(src.width, src.height);
    var cubefaceTextures = [];
    var imgTmp0;
    var imgTmp2;

    for (var i = 0; i < 6; i++) {
      var tempCanvas = document.createElement('CANVAS');
      tempCanvas.width = tempCanvas.height = cubeFaceSize;
      var tempCanvasContext = tempCanvas.getContext('2d');

      if (data.rotateCubemap) {
        if (i === 2 || i === 3) {
          tempCanvasContext.save();
          tempCanvasContext.translate(cubeFaceSize, cubeFaceSize);
          tempCanvasContext.rotate(Math.PI);
        }
      }

      // Note that this call to drawImage will not only copy the bytes to the
      // canvas but also could resized the image if our cube face size is
      // smaller than the source image due to GL max texture size.
      tempCanvasContext.drawImage(
        src,
        (i + faceOffset) * textureSourceCubeFaceSize, // top left x coord in source
        0, // top left y coord in source
        textureSourceCubeFaceSize, // x pixel count from source
        textureSourceCubeFaceSize, // y pixel count from source
        0, // dest x offset in the canvas
        0, // dest y offset in the canvas
        cubeFaceSize, // x pixel count in dest
        cubeFaceSize  // y pixel count in dest
      );

      tempCanvasContext.restore();

      if (callback) { callback(); }
      cubefaceTextures.push(tempCanvas);
    }

    if (data.rotateCubemap) {
      imgTmp0 = cubefaceTextures[0];
      imgTmp2 = cubefaceTextures[1];

      cubefaceTextures[0] = imgTmp2;
      cubefaceTextures[1] = imgTmp0;

      imgTmp0 = cubefaceTextures[4];
      imgTmp2 = cubefaceTextures[5];

      cubefaceTextures[4] = imgTmp2;
      cubefaceTextures[5] = imgTmp0;
    }

    if (callback) { callback(); }
    return cubefaceTextures;
  },

  loadCubeMapImage: function (layerColorTexture, src, faceOffset) {
    var gl = this.el.sceneEl.renderer.getContext();
    var cubefaceTextures;

    // don't flip the pixels as we load them into the texture buffer.
    // TEXTURE_CUBE_MAP expects the Y to be flipped for the faces and it already
    // is flipped in our texture image.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, layerColorTexture);

    if (!src.complete || this.loadingScreen) {
      cubefaceTextures = this.loadingScreenImages;
    } else {
      cubefaceTextures = this.generateCubeMapTextures(src, faceOffset);
    }

    var errorCode = 0;
    cubefaceTextures.forEach(function (canvas, i) {
      gl.texSubImage2D(
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
        0,
        0, 0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        canvas
      );
      errorCode = gl.getError();
    });

    if (errorCode !== 0) {
      console.log('renderingError, WebGL Error Code: ' + errorCode);
    }
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
  },

  tick: function () {
    if (!this.el.sceneEl.xrSession) { return; }
    if (!this.referenceSpace) { return; }
    if (this.layerEnabled && !this.layer && (this.el.sceneEl.is('vr-mode') || this.el.sceneEl.is('ar-mode'))) { this.initLayer(); }
    this.updateTransform();
    if (this.data.src.complete && (this.pendingCubeMapUpdate || this.loadingScreen || this.visibilityChanged)) { this.loadCubeMapImages(); }
    if (!this.needsRedraw && !this.layer.needsRedraw) { return; }
    if (this.textureIsVideo) { return; }
    if (this.data.type === 'quad' || this.data.type.endsWith('equirect')) { this.draw(); }
  },

  initLayer: function () {
    var self = this;
    var type = this.data.type;

    this.el.sceneEl.xrSession.onvisibilitychange = function (evt) {
      self.visibilityChanged = evt.session.visibilityState !== 'hidden';
    };

    if (type.endsWith('equirect')) {
      this.initEquirectLayer();
      return;
    }

    if (type === 'quad') {
      this.initQuadLayer();
      return;
    }

    if (type === 'monocubemap' || type === 'stereocubemap') {
      this.initCubeMapLayer();
      return;
    }
  },

  initEquirectLayer: function () {
    if (!this.texture) { return; }
    var sceneEl = this.el.sceneEl;
    var eqrtIs180 = this.data.is180;
    var eqrtRadius = this.data.radius;
    var eqrtLayout = this.data.type.replace('-equirect', ''); // mono stereo-left-right stereo-top-bottom
    if (this.textureIsVideo) {
      var mediaBinding = new XRMediaBinding(sceneEl.xrSession);
      this.layer = mediaBinding.createEquirectLayer(this.data.src, {
        space: this.referenceSpace,
        layout: eqrtLayout
      });
      if (this.leftEyeSphere) { this.leftEyeSphere.object3D.visible = false; }
      if (this.rightEyeSphere) { this.rightEyeSphere.object3D.visible = false; }
    } else {
      var eqrtTextureWidth = this.texture.image.width;
      var eqrtTextureHeight = this.texture.image.height;
      var xrGLFactory = this.xrGLFactory = sceneEl.renderer.xr.getBinding();
      this.layer = xrGLFactory.createEquirectLayer({
        space: this.referenceSpace,
        viewPixelWidth: eqrtTextureWidth / (eqrtLayout === 'stereo-left-right' ? 2 : 1),
        viewPixelHeight: eqrtTextureHeight / (eqrtLayout === 'stereo-top-bottom' ? 2 : 1),
        layout: eqrtLayout
      });
    }
    this.layer.centralHorizontalAngle = Math.PI * (eqrtIs180 ? 1 : 2);
    this.layer.upperVerticalAngle = Math.PI / 2.0;
    this.layer.lowerVerticalAngle = -Math.PI / 2.0;
    this.layer.radius = eqrtRadius;
    sceneEl.renderer.xr.addLayer(this.layer);
  },

  initQuadLayer: function () {
    if (!this.texture) { return; }
    var sceneEl = this.el.sceneEl;
    if (this.textureIsVideo) {
      var mediaBinding = new XRMediaBinding(sceneEl.xrSession);
      this.layer = mediaBinding.createQuadLayer(this.data.src, {
        space: this.referenceSpace,
        height: this.data.height / 2 || this.texture.image.height / 1000,
        width: this.data.width / 2 || this.texture.image.width / 1000
      });
    } else {
      var xrGLFactory = this.xrGLFactory = sceneEl.renderer.xr.getBinding();
      this.layer = xrGLFactory.createQuadLayer({
        space: this.referenceSpace,
        viewPixelHeight: this.texture.image.height,
        viewPixelWidth: this.texture.image.width,
        height: this.data.height / 2 || this.texture.image.height / 1000,
        width: this.data.width / 2 || this.texture.image.width / 1000
      });
    }
    sceneEl.renderer.xr.addLayer(this.layer);
  },

  initCubeMapLayer: function () {
    var src = this.data.src;
    var sceneEl = this.el.sceneEl;
    var gl = sceneEl.renderer.getContext();
    var glSizeLimit = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);
    var cubeFaceSize = this.cubeFaceSize = Math.min(glSizeLimit, Math.min(src.width, src.height));
    var xrGLFactory = this.xrGLFactory = sceneEl.renderer.xr.getBinding();
    this.layer = xrGLFactory.createCubeLayer({
      space: this.referenceSpace,
      viewPixelWidth: cubeFaceSize,
      viewPixelHeight: cubeFaceSize,
      layout: this.data.type === 'monocubemap' ? 'mono' : 'stereo',
      isStatic: false
    });

    this.initLoadingScreenImages();
    this.loadCubeMapImages();
    sceneEl.renderer.xr.addLayer(this.layer);
  },

  initLoadingScreenImages: function () {
    var cubeFaceSize = this.cubeFaceSize;
    var loadingScreenImages = this.loadingScreenImages = [];
    for (var i = 0; i < 6; i++) {
      var tempCanvas = document.createElement('CANVAS');
      tempCanvas.width = tempCanvas.height = cubeFaceSize;
      var tempCanvasContext = tempCanvas.getContext('2d');
      tempCanvas.width = tempCanvas.height = cubeFaceSize;
      tempCanvasContext.fillStyle = 'black';
      tempCanvasContext.fillRect(0, 0, cubeFaceSize, cubeFaceSize);
      if (i !== 2 && i !== 3) {
        tempCanvasContext.translate(cubeFaceSize, 0);
        tempCanvasContext.scale(-1, 1);
        tempCanvasContext.fillStyle = 'white';
        tempCanvasContext.font = '30px Arial';
        tempCanvasContext.fillText('Loading', cubeFaceSize / 2, cubeFaceSize / 2);
      }
      loadingScreenImages.push(tempCanvas);
    }
  },

  destroyLayer: function () {
    if (!this.layer) { return; }
    this.el.sceneEl.renderer.xr.removeLayer(this.layer);
    this.layer.destroy();
    this.layer = undefined;
  },

  toggleCompositorLayer: function () {
    this.enableCompositorLayer(!this.layerEnabled);
  },

  enableCompositorLayer: function (enable) {
    this.layerEnabled = enable;
    if (this.quadPanelEl) {
      this.quadPanelEl.object3D.visible = !this.layerEnabled;
    }
    if (this.leftEyeSphere) {
      this.updateSpheresVisibility();
    }
  },

  updateSpheres: function () {
    var materialData = {
      shader: 'flat',
      minFilter: 'linear',
      side: 'back',
      src: this.data.src
    };
    var sphereData = {
      primitive: 'sphere',
      radius: 198,
      segmentsWidth: 64,
      segmentsHeight: 64
    };
    var leftEyeSphere = this.leftEyeSphere;
    if (!this.leftEyeSphere) {
      leftEyeSphere = this.leftEyeSphere = document.createElement('a-entity');
      this.el.appendChild(leftEyeSphere);
    }

    leftEyeSphere.setAttribute('material', materialData);
    leftEyeSphere.setAttribute('geometry', sphereData);
    leftEyeSphere.setAttribute('scale', '-1 1 1');
    leftEyeSphere.object3D.visible = true;

    var rightEyeSphere = this.rightEyeSphere;
    if (!this.rightEyeSphere) {
      rightEyeSphere = this.rightEyeSphere = document.createElement('a-entity');
      this.el.appendChild(rightEyeSphere);
    }

    rightEyeSphere.setAttribute('material', materialData);
    rightEyeSphere.setAttribute('geometry', sphereData);
    rightEyeSphere.setAttribute('scale', '-1 1 1');

    this.el.sceneEl.camera.el.setAttribute('stereocam', 'eye: left');
    if (this.data.type === 'mono-equirect') {
      setTimeout(() => {
        leftEyeSphere.getObject3D('mesh').rotation.y = Math.PI / 2; // center pano
      });
      leftEyeSphere.removeAttribute('stereo'); // this will switch back to original sphere geometry
    } else {
      var split = this.data.type === 'stereo-left-right-equirect' ? 'horizontal' : 'vertical';
      var mode = this.data.is180 ? 'half' : 'full';
      leftEyeSphere.setAttribute('stereo', {eye: 'left', split: split, mode: mode}); // stereo component requires material component to be set first
      rightEyeSphere.setAttribute('stereo', {eye: 'right', split: split, mode: mode});
    }
    this.updateSpheresVisibility();
  },

  updateSpheresVisibility: function () {
    this.leftEyeSphere.object3D.visible = !this.layerEnabled;
    this.rightEyeSphere.object3D.visible = !this.layerEnabled && this.data.type !== 'mono-equirect';
  },

  updateQuadPanel: function () {
    var quadPanelEl = this.quadPanelEl;
    if (!this.quadPanelEl) {
      quadPanelEl = this.quadPanelEl = document.createElement('a-entity');
      this.el.appendChild(quadPanelEl);
    }

    quadPanelEl.setAttribute('material', {
      shader: 'flat',
      minFilter: 'linear',
      src: this.data.src,
      transparent: true
    });

    quadPanelEl.setAttribute('geometry', {
      primitive: 'plane',
      height: this.data.height || this.texture.image.height / 1000,
      width: this.data.width || this.texture.image.width / 1000
    });
  },

  draw: function () {
    var gl = this.el.sceneEl.renderer.getContext();
    var sceneEl = this.el.sceneEl;
    var textureEl = this.data.src;
    var glayer = this.xrGLFactory.getSubImage(this.layer, sceneEl.frame);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, glayer.colorTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, textureEl.width, textureEl.height, gl.RGBA, gl.UNSIGNED_BYTE, textureEl);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.needsRedraw = false;
  },

  updateTransform: function () {
    var el = this.el;
    var position = this.position;
    var quaternion = this.quaternion;
    el.object3D.updateMatrixWorld();
    position.setFromMatrixPosition(el.object3D.matrixWorld);
    quaternion.setFromRotationMatrix(el.object3D.matrixWorld);
    if (!this.layerEnabled) { position.set(0, 0, 100000000); }
    this.layer.transform = new XRRigidTransform(position, quaternion);
  },

  onEnterVR: function () {
    var sceneEl = this.el.sceneEl;
    var xrSession = sceneEl.xrSession;
    if (this.data.src.play) { this.data.src.play(); }
    if (!sceneEl.hasWebXR || typeof XRWebGLBinding === 'undefined' || typeof XRMediaBinding === 'undefined' || !xrSession) {
      warn('The layer component requires WebXR and the layers API enabled');
      return;
    }
    xrSession.requestReferenceSpace('local-floor').then(this.onRequestedReferenceSpace);
    this.layerEnabled = true;
    if (this.quadPanelEl) {
      this.quadPanelEl.object3D.visible = false;
    }
    if (this.leftEyeSphere) {
      this.updateSpheresVisibility();
    }
  },

  onExitVR: function () {
    this.layerEnabled = false;
    if (this.quadPanelEl) {
      this.quadPanelEl.object3D.visible = true;
    }
    if (this.leftEyeSphere) {
      this.updateSpheresVisibility();
    }
    this.destroyLayer();
  },

  onRequestedReferenceSpace: function (referenceSpace) {
    this.referenceSpace = referenceSpace;
  }
});
