const DEFAULT_CHARACTERS = ' .-:+*=%@#';

function colorClass(red, green, blue) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  if (max - min < 18) return 'ac-g';

  let hue;
  if (max === red) hue = ((green - blue) / (max - min)) % 6;
  else if (max === green) hue = (blue - red) / (max - min) + 2;
  else hue = (red - green) / (max - min) + 4;

  const normalized = (hue * 60 + 360) % 360;
  return `ac-${Math.round(normalized / 30) % 12}`;
}

export class CspAsciiEffect {
  constructor(renderer, characters = DEFAULT_CHARACTERS, options = {}) {
    const resolution = options.resolution || 0.15;
    const invert = options.invert || false;
    const palette = [...characters];
    const root = document.createElement('div');
    const table = document.createElement('table');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let sampleWidth = 1;
    let sampleHeight = 1;
    let latestPixels = null;

    root.id = 'ascii';
    root.appendChild(table);
    table.className = 'ascii-table';
    table.cellSpacing = 0;
    table.cellPadding = 0;

    function readPixel(x, y) {
      if (!latestPixels) return null;
      const clampedX = Math.max(0, Math.min(sampleWidth - 1, x));
      const clampedY = Math.max(0, Math.min(sampleHeight - 1, y));
      const offset = (clampedY * sampleWidth + clampedX) * 4;
      const red = latestPixels[offset];
      const green = latestPixels[offset + 1];
      const blue = latestPixels[offset + 2];
      const alpha = latestPixels[offset + 3];
      const brightness = alpha === 0 ? 0 : (red * 0.3 + green * 0.59 + blue * 0.11) / 255;
      let index = Math.floor((1 - brightness) * (palette.length - 1));
      if (invert) index = palette.length - index - 1;
      const paletteCharacter = palette[index] || '#';
      return {
        character: paletteCharacter === ' ' ? '.' : paletteCharacter,
        className: brightness < 0.025 ? 'ac-g' : colorClass(red, green, blue),
        red,
        green,
        blue,
        brightness,
      };
    }

    this.domElement = root;

    this.setSize = (width, height) => {
      renderer.setSize(width, height, false);
      sampleWidth = Math.max(1, Math.floor(width * resolution));
      sampleHeight = Math.max(1, Math.floor(height * resolution));
      canvas.width = sampleWidth;
      canvas.height = sampleHeight;
    };

    this.sampleAt = (normalizedX = 0.5, normalizedY = 0.5) => {
      const centerX = Math.floor(normalizedX * sampleWidth);
      const centerY = Math.floor(normalizedY * sampleHeight);
      const center = readPixel(centerX, centerY);
      if (center?.brightness >= 0.06) return center;

      for (let radius = 1; radius <= 18; radius += 1) {
        for (let y = -radius; y <= radius; y += 1) {
          for (let x = -radius; x <= radius; x += 1) {
            if (Math.abs(x) !== radius && Math.abs(y) !== radius) continue;
            const candidate = readPixel(centerX + x, centerY + y);
            if (candidate?.brightness >= 0.06) return candidate;
          }
        }
      }

      return center || {
        character: '#',
        className: 'ac-6',
        red: 85,
        green: 215,
        blue: 233,
        brightness: 0.5,
      };
    };

    this.render = (scene, camera) => {
      renderer.render(scene, camera);
      context.clearRect(0, 0, sampleWidth, sampleHeight);
      context.drawImage(renderer.domElement, 0, 0, sampleWidth, sampleHeight);
      latestPixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
      const rows = [];

      for (let y = 0; y < sampleHeight; y += 2) {
        let row = '';
        let activeClass = '';

        for (let x = 0; x < sampleWidth; x += 1) {
          const sample = readPixel(x, y);
          const character = sample.character === '.' && sample.brightness < 0.025 ? '&nbsp;' : sample.character;
          const nextClass = sample.brightness < 0.025 ? '' : sample.className;

          if (nextClass !== activeClass) {
            if (activeClass) row += '</span>';
            if (nextClass) row += `<span class="${nextClass}">`;
            activeClass = nextClass;
          }
          row += character;
        }

        if (activeClass) row += '</span>';
        rows.push(row);
      }

      table.innerHTML = `<tbody><tr><td>${rows.join('<br>')}</td></tr></tbody>`;
    };
  }
}
