const { spawn } = require('child_process');

const safeExecute = (command, args = [], options = {}) => {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, options);
    
    let stdout = '';
    let stderr = '';
    
    process.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code !== 0) {
        const sanitizedError = sanitizeSystemError(stderr || stdout);
        reject(new Error(sanitizedError));
      } else {
        resolve(stdout);
      }
    });
  });
};

const sanitizeSystemError = (error) => {
  if (error.includes('MinGW') || error.includes('sourceforge') || error.includes('JDK detected') || error.includes('Java execution handler')) {
    return 'System configuration required. Please contact administrator.';
  }
  return 'Process execution failed. Please try again.';
};

module.exports = { safeExecute };