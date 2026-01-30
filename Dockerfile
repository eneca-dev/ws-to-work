# Используем Node.js 18 Alpine (легкий образ)
FROM node:18-alpine

# Устанавливаем tzdata для поддержки часовых поясов и wget для healthcheck
RUN apk add --no-cache tzdata wget

# Устанавливаем часовой пояс Минск
ENV TZ=Europe/Minsk

# Создаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости (production only)
RUN npm ci --only=production

# Копируем весь код приложения
COPY . .

# Открываем порт 3004
EXPOSE 3004

# Запускаем приложение
CMD ["npm", "start"]
