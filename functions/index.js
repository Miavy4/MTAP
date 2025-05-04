export async function onRequest(context) {
  const { request, env, next } = context;

  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }
  else if (request.method === 'POST') {
    return handlePostRequest(request, env);
  }
  else {
    return next();
  }
}

function handleOptions(request) {
  let headers = request.headers;
  if (
    headers.get("Origin") !== null &&
    headers.get("Access-Control-Request-Method") !== null &&
    headers.get("Access-Control-Request-Headers") !== null
  ) {
    let respHeaders = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": headers.get("Access-Control-Request-Headers"),
      "Access-Control-Max-Age": "86400",
    });
    return new Response(null, { headers: respHeaders });
  } else {
    return new Response(null, { headers: { Allow: "POST, OPTIONS" } });
  }
}

async function handlePostRequest(request, env) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return new Response(JSON.stringify({ message: 'No file found in form data.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const GITHUB_TOKEN = env.GITHUB_TOKEN;
    const REPO_NAME = env.REPO_NAME;
    const USER_NAME = env.USER_NAME;

    if (!GITHUB_TOKEN || !REPO_NAME || !USER_NAME) {
       console.error("Missing GitHub environment variables");
       return new Response(JSON.stringify({ message: 'Server configuration error: Missing GitHub credentials.' }), {
         status: 500,
         headers: { ...corsHeaders, 'Content-Type': 'application/json' }
       });
    }

    const filePath = `uploads/${Date.now()}-${file.name}`;
    const githubUrl = `https://api.github.com/repos/${USER_NAME}/${REPO_NAME}/contents/${filePath}`;

    const contentArrayBuffer = await file.arrayBuffer();
    const contentBase64 = btoa(String.fromCharCode(...new Uint8Array(contentArrayBuffer)));

    const githubResponse = await fetch(githubUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CloudflareWorker-FileUploader'
      },
      body: JSON.stringify({
        message: `Upload file: ${file.name}`,
        content: contentBase64,
        branch: 'main'
      })
    });

    if (!githubResponse.ok) {
      const errorData = await githubResponse.json();
      console.error('GitHub API Error:', errorData);
      throw new Error(`GitHub API Error: ${errorData.message || githubResponse.statusText}`);
    }

    const responseData = await githubResponse.json();
    const fileUrl = responseData.content.html_url;

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