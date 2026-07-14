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

    root.id = 'ascii';
    root.appendChild(table);
    table.className = 'ascii-table';
    table.cellSpacing = 0;
    table.cellPadding = 0;

    this.domElement = root;

    this.setSize = (width, height) => {
      renderer.setSize(width, height, false);
      sampleWidth = Math.max(1, Math.floor(width * resolution));
      sampleHeight = Math.max(1, Math.floor(height * resolution));
      canvas.width = sampleWidth;
      canvas.height = sampleHeight;
    };

    this.render = (scene, camera) => {
      renderer.render(scene, camera);
      context.clearRect(0, 0, sampleWidth, sampleHeight);
      context.drawImage(renderer.domElement, 0, 0, sampleWidth, sampleHeight);
      const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
      const rows = [];

      for (let y = 0; y < sampleHeight; y += 2) {
        let row = '';
        let activeClass = '';

        for (let x = 0; x < sampleWidth; x += 1) {
          const offset = (y * sampleWidth + x) * 4;
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          const alpha = pixels[offset + 3];
          const brightness = alpha === 0 ? 0 : (red * 0.3 + green * 0.59 + blue * 0.11) / 255;
          let index = Math.floor((1 - brightness) * (palette.length - 1));
          if (invert) index = palette.length - index - 1;
          const character = palette[index] === ' ' ? '&nbsp;' : palette[index];
          const nextClass = brightness < 0.025 ? '' : colorClass(red, green, blue);

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
