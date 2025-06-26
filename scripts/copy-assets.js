const fs = require('fs');
const path = require('path');

// 복사할 폴더/파일 목록
const assets = [
  { src: 'src/views', dest: 'dist/views' },
  // 필요하면 다른 assets도 추가
  // { src: 'src/public', dest: 'dist/public' },
];

// dist 폴더 생성
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// 각 asset 복사
assets.forEach(({ src, dest }) => {
  if (fs.existsSync(src)) {
    // 대상 폴더가 이미 있으면 삭제
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    
    // 복사
    fs.cpSync(src, dest, { recursive: true });
    console.log(`✓ Copied ${src} → ${dest}`);
  } else {
    console.log(`⚠ Source not found: ${src}`);
  }
});

console.log('Asset copying completed!');