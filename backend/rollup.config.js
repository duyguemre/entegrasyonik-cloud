import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'dist/entegrasyonik.js', // Başlangıç dosyanız
  output: {
    dir: 'dist/bundle',
    format: 'esm'
  },
  external: [
    '@mongodb-js/zstd-win32-x64-msvc', // Dışa aktarmak istediğiniz modül
    '@napi-rs/snappy-win32-x64-msvc', // Dışa aktarmak istediğiniz modül

    // Diğer dışa aktarmak istediğiniz modülleri buraya ekleyebilirsiniz
  ],
  plugins: [
    resolve(),
    commonjs(),
    json(), // JSON eklentisini buraya ekleyin

  ],
};