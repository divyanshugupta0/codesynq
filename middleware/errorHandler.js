const errorHandler = (err, req, res, next) => {
  console.error('Full error:', err);
  
  const sanitizedMessage = sanitizeErrorMessage(err.message || 'An unexpected error occurred');
  
  res.status(err.status || 500).json({
    error: sanitizedMessage,
    timestamp: new Date().toISOString()
  });
};

const sanitizeErrorMessage = (message) => {
  const systemErrorPatterns = [
    /Download MinGW from.*?and add to PATH/gi,
    /C:\\.*?/g,
    /Error: C:/gi,
    /https:\/\/sourceforge\.net\/projects\/mingw-w64\/files\//gi,
    /Java: JDK detected but server needs Java execution handler\. Check server logs\./gi,
    /JDK detected/gi,
    /Check server logs/gi
  ];
  
  let sanitized = message;
  systemErrorPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });
  
  if (sanitized.trim().length === 0 || sanitized !== message) {
    return 'A system configuration error occurred. Please contact support.';
  }
  
  return sanitized.trim();
};

module.exports = errorHandler;