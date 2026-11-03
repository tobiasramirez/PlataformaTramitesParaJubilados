# 1. Imagen base mínima y versionada explícitamente (Clase 12)
FROM node:24-alpine

# 2. Establecer el directorio de trabajo
WORKDIR /app

# 3. Copiar manifiestos de dependencias
COPY package*.json ./

# 4. Instalación limpia solo con dependencias de producción
RUN npm ci --omit=dev

# 5. Copiar el código fuente de la aplicación
COPY . .

# 6. HARDENING (Clase 12): Cambiar a usuario no privilegiado 'node'
# Evita ejecuciones como root dentro del contenedor
USER node

# 7. Declarar el puerto interno
EXPOSE 3000

# 8. Comando de arranque principal
CMD ["node", "src/index.js"]
