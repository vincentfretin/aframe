/* global AFRAME, THREE */
// Demonstrates per-instance raycasting on THREE.BatchedMesh and THREE.InstancedMesh.
//
// A-Frame's raycaster resolves each intersection back to a logical per-instance
// a-entity by reading the shared mesh's userData:
//   - batchedMesh.userData.batchIdToEl[batchId] -> entity
//   - instancedMesh.userData.instanceIdToEl[instanceId] -> entity
//
// Apps build the map when they assemble the shared mesh, and events
// (raycaster-intersected, mouseenter, click, ...) fire on the matched entity.
//
// Each per-instance a-entity uses the standard `position` component as the
// source of truth for its slot's matrix. `hover-tint` changes the slot color
// via setColorAt on mouseenter / mouseleave.

var BOX_COLOR = new THREE.Color('#4cc3d9');
var CONE_COLOR = new THREE.Color('#f1ea65');
var HOVER_COLOR = new THREE.Color('#ff6b9d');

AFRAME.registerComponent('log-events', {
  events: {
    mouseenter: function () { console.log('[mouseenter]', this.el.id); },
    mouseleave: function () { console.log('[mouseleave]', this.el.id); },
    click: function () { console.log('[click]', this.el.id); }
  }
});

AFRAME.registerComponent('hover-tint', {
  events: {
    mouseenter: function () { this.setColor(HOVER_COLOR); },
    mouseleave: function () { this.setColor(this.baseColor); }
  },
  setColor: function (color) {
    var slot = this.el.object3D.userData.batchSlot;
    if (!slot || !color) { return; }
    slot.mesh.setColorAt(slot.id, color);
    if (slot.mesh.instanceColor) { slot.mesh.instanceColor.needsUpdate = true; }
  }
});

function stashSlot (el, mesh, id, baseColor) {
  el.object3D.userData.batchSlot = { mesh: mesh, id: id };
  var tint = el.components['hover-tint'];
  if (tint) { tint.baseColor = baseColor; }
}

function buildBatchedMesh (hostEl, memberEls, baseColor) {
  var geometry = new THREE.BoxGeometry(1, 1, 1);
  var material = new THREE.MeshStandardMaterial();
  var batched = new THREE.BatchedMesh(
    memberEls.length,
    geometry.attributes.position.count,
    geometry.index.count,
    material
  );
  var geomId = batched.addGeometry(geometry);
  batched.userData.batchIdToEl = [];

  memberEls.forEach(function (el) {
    var instanceId = batched.addInstance(geomId);
    el.object3D.updateMatrix();
    batched.setMatrixAt(instanceId, el.object3D.matrix);
    batched.setColorAt(instanceId, baseColor);
    batched.userData.batchIdToEl[instanceId] = el;
    stashSlot(el, batched, instanceId, baseColor);
  });

  hostEl.setObject3D('mesh', batched);
}

function buildInstancedMesh (hostEl, memberEls, baseColor) {
  var geometry = new THREE.ConeGeometry(0.5, 1, 16);
  var material = new THREE.MeshStandardMaterial();
  var mesh = new THREE.InstancedMesh(geometry, material, memberEls.length);
  mesh.userData.instanceIdToEl = [];

  memberEls.forEach(function (el, i) {
    el.object3D.updateMatrix();
    mesh.setMatrixAt(i, el.object3D.matrix);
    mesh.setColorAt(i, baseColor);
    mesh.userData.instanceIdToEl[i] = el;
    stashSlot(el, mesh, i, baseColor);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) { mesh.instanceColor.needsUpdate = true; }

  hostEl.setObject3D('mesh', mesh);
}

document.addEventListener('DOMContentLoaded', function () {
  var sceneEl = document.querySelector('a-scene');
  sceneEl.addEventListener('loaded', function () {
    buildBatchedMesh(
      document.getElementById('batchHost'),
      [
        document.getElementById('boxA'),
        document.getElementById('boxB'),
        document.getElementById('boxC')
      ],
      BOX_COLOR
    );

    buildInstancedMesh(
      document.getElementById('instanceHost'),
      [
        document.getElementById('coneA'),
        document.getElementById('coneB'),
        document.getElementById('coneC')
      ],
      CONE_COLOR
    );
  });
});
