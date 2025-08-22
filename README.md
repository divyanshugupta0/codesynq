# CodeNexus Pro

A real-time collaborative code editor with multi-language support.

## Features

- Real-time collaborative editing
- Multi-language support (JavaScript, Python, Java, C, C++, HTML, CSS)
- Live code execution
- Chat functionality
- Room-based collaboration
- Terminal output display

## Supported Languages

- **JavaScript** - Node.js runtime
- **Python** - Python 3 interpreter
- **Java** - OpenJDK 11
- **C** - GCC compiler
- **C++** - G++ compiler
- **HTML/CSS** - Preview support

## Deployment

### Deploy to Render

1. Fork this repository
2. Connect your GitHub account to [Render](https://render.com/)
3. Create a new Web Service
4. Select this repository
5. Render will automatically detect the Dockerfile and deploy

### Local Development

```bash
npm install
npm start
```

### Docker

```bash
docker build -t codenexus-pro .
docker run -p 3000:3000 codenexus-pro
```

## Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (production/development)

## License

MIT License