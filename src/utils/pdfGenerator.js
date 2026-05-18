const { spawn } = require('child_process');
const path      = require('path');

function generatePdf(data) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '../../generate_pdf.py');
    const proc   = spawn('python', [script], { stdio: ['pipe', 'pipe', 'pipe'] });

    const chunks = [];
    proc.stdout.on('data', chunk => chunks.push(chunk));
    proc.stderr.on('data', d => console.error('[PDF]', d.toString().trim()));
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`generate_pdf.py が終了コード ${code} で失敗`));
      resolve(Buffer.concat(chunks));
    });
    proc.on('error', reject);

    proc.stdin.write(JSON.stringify(data));
    proc.stdin.end();
  });
}

module.exports = { generatePdf };
