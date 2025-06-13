<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BTC Offline Key Search</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>

  <div class="container">
    <h1>BTC Key Finder</h1>

    <div class="field-row">
      <label for="startKey">Начало диапазона (hex):</label>
      <div class="input-with-btn">
        <input id="startKey"
               type="text"
               value="0000000000000000000000000000000000000000000000000000000000000001"
               placeholder="start key" />
        <button class="paste-btn" data-target="startKey">📋</button>
      </div>
    </div>

    <div class="field-row">
      <label for="endKey">Конец диапазона (hex):</label>
      <div class="input-with-btn">
        <input id="endKey"
               type="text"
               value="00000000000000000000000000000000000000000000000000000000000000ff"
               placeholder="end key" />
        <button class="paste-btn" data-target="endKey">📋</button>
      </div>
    </div>

    <div class="field-row">
      <label for="prefix">Префикс адреса:</label>
      <div class="input-with-btn">
        <input id="prefix"
               type="text"
               value="1abc"
               placeholder="address prefix" />
        <button class="paste-btn" data-target="prefix">📋</button>
      </div>
    </div>

    <div class="buttons-row">
      <button id="startBtn">Старт</button>
      <button id="pauseBtn">Пауза</button>
      <button id="saveBtn">Скачать результаты</button>
    </div>

    <div class="progress-container">
      <div id="progressBar"></div>
      <span id="progressText">Прогресс: 0%</span>
    </div>

    <h3>Найденные совпадения:</h3>
    <div id="found"></div>
  </div>

  <script src="libs/bundle.js"></script>
  <script src="main.js"></script>
</body>
</html>
