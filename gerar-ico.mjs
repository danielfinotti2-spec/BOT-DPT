// Gera build/icone.ico a partir de build/icone.png (vários tamanhos), sem dependências externas.
import fs from 'node:fs';

const png = fs.readFileSync('build/icone.png');
if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('icone.png inválido');
const largura = png.readUInt32BE(16);
const altura = png.readUInt32BE(20);
if (largura !== 256 || altura !== 256) throw new Error(`ícone precisa ser 256x256, veio ${largura}x${altura}`);

const tamanhos = [256, 128, 64, 48, 32, 16];
const cabecalho = Buffer.alloc(6);
cabecalho.writeUInt16LE(0, 0); // reservado
cabecalho.writeUInt16LE(1, 2); // tipo: ícone
cabecalho.writeUInt16LE(tamanhos.length, 4);

const entradas = Buffer.alloc(16 * tamanhos.length);
let deslocamento = 6 + 16 * tamanhos.length;
tamanhos.forEach((t, i) => {
  const e = i * 16;
  entradas.writeUInt8(t >= 256 ? 0 : t, e + 0); // largura (0 = 256)
  entradas.writeUInt8(t >= 256 ? 0 : t, e + 1); // altura
  entradas.writeUInt8(0, e + 2); // cores na paleta
  entradas.writeUInt8(0, e + 3); // reservado
  entradas.writeUInt16LE(1, e + 4); // planos
  entradas.writeUInt16LE(32, e + 6); // bits por pixel
  entradas.writeUInt32LE(png.length, e + 8);
  entradas.writeUInt32LE(deslocamento, e + 12);
  deslocamento += png.length;
});

fs.writeFileSync('build/icone.ico', Buffer.concat([cabecalho, entradas, ...tamanhos.map(() => png)]));
console.log(`build/icone.ico gerado (${tamanhos.length} tamanhos)`);
