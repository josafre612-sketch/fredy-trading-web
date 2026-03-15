export default async function handler(req, res) {
  // Permitir CORS para tu frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const API_KEY = process.env.GEXBOT_API_KEY || 'vQfF5Kdd4CWx';
  const { path } = req.query;

  if (!path) {
    return res.status(400).json({ error: 'path requerido' });
  }

  // Construir URL de GEXBot
  const url = `https://api.gexbot.com/${path}&key=${API_KEY}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NASDAQPRODashboard/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ 
        error: `GEXBot error: ${response.status}`,
        detail: errText 
      });
    }

    const data = await response.json();
    
    // Cache de 5 segundos
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate');
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ 
      error: 'Error conectando con GEXBot',
      detail: error.message 
    });
  }
}
