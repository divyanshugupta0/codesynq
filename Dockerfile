FROM node:18-alpine

# Install compilers and runtime environments
RUN apk add --no-cache \
    gcc \
    g++ \
    python3 \
    py3-pip \
    openjdk11 \
    make \
    libc-dev && \
    ln -sf python3 /usr/bin/python

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]