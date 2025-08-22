process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  
  if (error.message.includes('MinGW') || error.message.includes('Download')) {
    console.log('System configuration error detected - not exposing to user');
    return;
  }
  
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  
  if (reason && reason.toString().includes('MinGW')) {
    console.log('System error suppressed from user view');
    return;
  }
});

module.exports = {};