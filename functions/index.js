// Файл: functions/upload.js

/**
 * Обработчик для Cloudflare Pages Functions
 * Он будет вызываться для всех запросов, согласно вашему _routes.json
 */
export async function onRequest(context) {
  const { request, env } = context; // Получаем объект запроса и переменные окружения

  // Обработка CORS Preflight запроса (метод OPTIONS)
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }
  // Обработка POST запроса (загрузка файла)
  else if (request.method === 'POST') {
    return handlePostRequest(request, env); // Передаем env для доступа к секретам
  }
  // Обработка GET запроса (можно просто вернуть сообщение)
  else if (request.method === 'GET') {
    // GET запросы на / будут по-прежнему обрабатываться вашим index.html
    // Этот код сработает, если GET придет на какой-то другой путь,
    // который не соответствует статическому файлу.
    // Можно вернуть статус или просто разрешить Pages искать статический файл.
    // Для простоты, вернем ошибку, т.к. мы ждем только POST.
     return new Response('This function only handles POST requests for uploads.', { status: 405 });
  }
  // Другие методы не разрешены
  else {
    return new Response('Method Not Allowed', { status: 405 });
  }
}

// Функция для обработки CORS Preflight (OPTIONS)
function handleOptions(request) {
  let headers = request.headers;
  if (
    headers.get("Origin") !== null &&
    headers.get("Access-Control-Request-Method") !== null &&
    headers.get("Access-Control-Request-Headers") !== null
  ) {
    // Разрешаем запрос от любого источника, методы POST/OPTIONS, и запрошенные заголовки
    let respHeaders = new Headers({
      "Access-Control-Allow-Origin": "*", // Или ваш конкретный домен Pages для большей безопасности
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": headers.get("Access-Control-Request-Headers"),
      "Access-Control-Max-Age": "86400", // Кешировать preflight на день
    });
    return new Response(null, { headers: respHeaders });
  } else {
    // Стандартный ответ на OPTIONS
    return new Response(null, { headers: { Allow: "POST, OPTIONS" } });
  }
}

// Функция для обработки POST запроса
async function handlePostRequest(request, env) {
  // Устанавливаем CORS заголовок для фактического ответа
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*' // Или ваш домен Pages
  };

  try {
    const formData = await request.formData();
    const file = formData.get('file'); // Имя 'file' должно совпадать с frontend

    if (!file) {
      return new Response(JSON.stringify({ message: 'No file found in form data.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- НАЧАЛО: ВАША ЛОГИКА ЗАГРУЗКИ НА GITHUB ---
    // Получите секреты из переменных окружения (env)
    // Их нужно настроить в Cloudflare Pages: Settings -> Functions -> KV Namespace Bindings / Environment Variables
    const GITHUB_TOKEN = env.GITHUB_TOKEN; // Имена переменных должны совпадать с настройками CF
    const REPO_NAME = env.REPO_NAME;     // Например: Miavy4/MTAP
    const USER_NAME = env.USER_NAME;     // Например: Miavy4 (или ваше имя/организация)

    if (!GITHUB_TOKEN || !REPO_NAME || !USER_NAME) {
       console.error("Missing GitHub environment variables");
       return new Response(JSON.stringify({ message: 'Server configuration error: Missing GitHub credentials.' }), {
         status: 500,
         headers: { ...corsHeaders, 'Content-Type': 'application/json' }
       });
    }

    const filePath = `uploads/${Date.now()}-${file.name}`; // Путь для сохранения файла в репо (папка uploads)
    const githubUrl = `https://api.github.com/repos/${USER_NAME}/${REPO_NAME}/contents/${filePath}`;

    // Содержимое файла нужно кодировать в Base64 для GitHub API
    const contentArrayBuffer = await file.arrayBuffer();
    const contentBase64 = btoa(String.fromCharCode(...new Uint8Array(contentArrayBuffer)));

    const githubResponse = await fetch(githubUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CloudflareWorker-FileUploader' // GitHub требует User-Agent
      },
      body: JSON.stringify({
        message: `Upload file: ${file.name}`, // Сообщение коммита
        content: contentBase64,
        branch: 'main' // Укажите вашу ветку
      })
    });

    if (!githubResponse.ok) {
      const errorData = await githubResponse.json();
      console.error('GitHub API Error:', errorData);
      throw new Error(`GitHub API Error: ${errorData.message || githubResponse.statusText}`);
    }

    const responseData = await githubResponse.json();
    const fileUrl = responseData.content.html_url; // URL файла на GitHub
    // --- КОНЕЦ: ВАША ЛОГИКА ЗАГРУЗКИ НА GITHUB ---


    // Успешный ответ
    const successResponse = {
      message: 'File uploaded successfully to GitHub!',
      url: fileUrl
    };

    return new Response(JSON.stringify(successResponse), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error handling POST request:', error);
    return new Response(JSON.stringify({ message: 'Upload failed on server.', error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
