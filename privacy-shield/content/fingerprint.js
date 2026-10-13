// Runs inside the page before any site code to make fingerprinting less reliable:
//  - Canvas: images read back from a <canvas> get invisible noise (a few
//    pixels change by 1 shade), so the "canvas fingerprint" differs on each visit.
//  - WebGL: hides the exact graphics card model.
//  - Battery: removes the Battery Status API, which can be used to link sessions.
(() => {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const MAX_PIXELS = 4_000_000; // leave very large canvases (photo editors etc.) untouched

  // Flip the lowest bit of the red channel on roughly 1 in 64 pixels, chosen by the seed.
  function addNoise(imageData) {
    const data = imageData.data;
    for (let px = 0; px < data.length / 4; px++) {
      if (((Math.imul(px, 2654435761) ^ seed) & 63) === 0) data[px * 4] ^= 1;
    }
    return imageData;
  }

  const ctx2d = CanvasRenderingContext2D.prototype;
  const canvasProto = HTMLCanvasElement.prototype;
  const origGetImageData = ctx2d.getImageData;
  const origToDataURL = canvasProto.toDataURL;
  const origToBlob = canvasProto.toBlob;

  ctx2d.getImageData = function (...args) {
    const img = origGetImageData.apply(this, args);
    return img.width * img.height <= MAX_PIXELS ? addNoise(img) : img;
  };

  // Returns a noisy copy of the canvas to export, or the canvas itself if a copy isn't possible.
  function noisyCopy(canvas) {
    const { width, height } = canvas;
    if (!width || !height || width * height > MAX_PIXELS) return canvas;
    try {
      const copy = document.createElement('canvas');
      copy.width = width;
      copy.height = height;
      const ctx = copy.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      ctx.putImageData(addNoise(origGetImageData.call(ctx, 0, 0, width, height)), 0, 0);
      return copy;
    } catch {
      return canvas; // e.g. cross-origin content: let the original call behave as normal
    }
  }

  canvasProto.toDataURL = function (...args) {
    return origToDataURL.apply(noisyCopy(this), args);
  };
  canvasProto.toBlob = function (...args) {
    return origToBlob.apply(noisyCopy(this), args);
  };

  const UNMASKED_VENDOR = 0x9245;
  const UNMASKED_RENDERER = 0x9246;
  for (const Ctx of [self.WebGLRenderingContext, self.WebGL2RenderingContext]) {
    if (!Ctx) continue;
    const origGetParameter = Ctx.prototype.getParameter;
    Ctx.prototype.getParameter = function (param) {
      if (param === UNMASKED_VENDOR) return 'Google Inc.';
      if (param === UNMASKED_RENDERER) return 'ANGLE (Generic Renderer)';
      return origGetParameter.call(this, param);
    };
  }

  delete Navigator.prototype.getBattery;
})();
