/* global require, process */
const { execSync } = require('child_process');
const ports = [3000, 3001, 5555, 8000];

if (process.platform === 'win32') {
  ports.forEach((p) => {
    try {
      execSync(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${p}') do taskkill /F /PID %a`, {
        shell: 'cmd',
        stdio: 'ignore',
      });
    } catch {
      // Port not in use
    }
  });
} else {
  try {
    execSync(`lsof -ti:${ports.join(',')} | xargs kill -9`, { stdio: 'ignore' });
  } catch {
    // Ports not in use
  }
}
