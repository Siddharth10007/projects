require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const { YoutubeTranscript } = require('youtube-transcript');
const fetch = require('node-fetch');

const app = express();
const port = 3000;
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Initialize Groq API client
const groqApiKey = process.env.GROQ_API_KEY;

// Initialize SerpAPI client
const serpApiKey = process.env.SERP_API_KEY;

// Database setup
const db = new sqlite3.Database('./database.db');

db.run(`CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT UNIQUE,
  count INTEGER DEFAULT 1
)`);

db.run(`CREATE TABLE IF NOT EXISTS study_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  subject TEXT,
  goal TEXT,
  deadline TEXT,
  study_hours INTEGER,
  plan_data TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

app.use(express.static('public'));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Original routes
app.post('/generate', async (req, res) => {
    try {
        const { input, isTopic } = req.body;
        
        if (isTopic) {
            const row = await new Promise((resolve) => {
                db.get('SELECT * FROM questions WHERE topic = ?', [input], (err, row) => resolve(row));
            });

            if (row) {
                db.run('UPDATE questions SET count = count + 1 WHERE topic = ?', [input]);
                return res.json({ question: await generateQuestion(row.topic) });
            }
        }

        const question = isTopic ? await generateQuestion(input) : await modifyQuestion(input);
        if (isTopic) {
            db.run('INSERT OR IGNORE INTO questions (topic) VALUES (?)', [input]);
        }
        res.json({ question });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/upload', async (req, res) => {
    try {
        const imageData = req.body.image;
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const question = await analyzeImage(base64Data);
        res.json({ question });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/popular', (req, res) => {
    db.all('SELECT topic, count FROM questions ORDER BY count DESC LIMIT 10', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// AI Functions
async function generateQuestion(topic) {
    const prompt = `Generate a detailed question about ${topic} with specific numerical values. Format: Question: [question]`;
    const result = await model.generateContent(prompt);
    return (await result.response).text();
}

async function modifyQuestion(question) {
    const prompt = `Create a similar question to "${question}" by changing only the numerical values. Maintain the same structure and question type.`;
    const result = await model.generateContent(prompt);
    return (await result.response).text();
}

async function analyzeImage(base64Data) {
    const prompt = "This is a photo of a question. Generate a similar question maintaining the same structure but changing numerical values and specific details where appropriate.";
    const imagePart = {
        inlineData: {
            data: base64Data,
            mimeType: 'image/jpeg'
        }
    };
    const result = await model.generateContent([prompt, imagePart]);
    return (await result.response).text();
}

// New API routes

// 1. Groq API - AI explanations
app.post('/api/ai/explain', async (req, res) => {
    try {
        const { query } = req.body;
        
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama3-8b-8192',
            messages: [
                { role: 'system', content: 'You are an educational assistant that explains concepts clearly and concisely.' },
                { role: 'user', content: `Explain this concept: ${query}` }
            ],
            temperature: 0.5,
            max_tokens: 1000
        }, {
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        res.json({
            success: true,
            explanation: response.data.choices[0].message.content
        });
    } catch (error) {
        console.error('Groq API Error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate explanation' });
    }
});

// 2. Hugging Face API - Generate similar questions
app.post('/api/ai/generate-questions', async (req, res) => {
    try {
        const { concept } = req.body;
        
        const response = await axios.post(
            'https://api-inference.huggingface.co/models/google/flan-t5-xxl',
            {
                inputs: `Generate 5 questions about: ${concept}`,
                parameters: {
                    max_length: 500,
                    temperature: 0.7
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.HUGGING_FACE_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        const generatedText = response.data[0].generated_text;
        const questions = generatedText.split('\n').filter(q => q.trim().length > 0);
        
        res.json({
            success: true,
            questions: questions
        });
    } catch (error) {
        console.error('Hugging Face API Error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate questions' });
    }
});

// 3. Crawl4AI API - Web crawling for study materials
app.post('/api/crawl/website', async (req, res) => {
    try {
        const { url, depth } = req.body;
        
        const response = await axios.post('https://api.crawl4ai.com/v1/crawl', {
            url: url,
            depth: depth || 2,
            max_pages: 20
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.CRAWL4AI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        res.json({
            success: true,
            crawlResults: response.data
        });
    } catch (error) {
        console.error('Crawl4AI Error:', error);
        res.status(500).json({ success: false, error: 'Failed to crawl website' });
    }
});

// 4. SerpAPI / DuckDuckGo API - Research papers & study materials
app.get('/api/resources/search', async (req, res) => {
    try {
        const { query, type } = req.query;
        
        if (process.env.USE_SERP_API === 'true') {
            // Using SerpAPI
            const response = await axios.get('https://serpapi.com/search', {
                params: {
                    q: type === 'papers' ? `${query} research paper` : query,
                    engine: 'google_scholar',
                    api_key: serpApiKey
                }
            });
            
            const results = response.data.organic_results.map(result => ({
                title: result.title,
                snippet: result.snippet,
                source: result.publication_info?.summary || 'Unknown source',
                date: result.publication_info?.published_date || null
            }));
            
            res.json({
                success: true,
                results: results
            });
        } else {
            // Using DuckDuckGo API as alternative
            const response = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
            
            const results = response.data.RelatedTopics.map(topic => ({
                title: topic.Text.split(' - ')[0],
                snippet: topic.Text.split(' - ')[1] || topic.Text,
                source: 'DuckDuckGo',
                date: null
            }));
            
            res.json({
                success: true,
                results: results
            });
        }
    } catch (error) {
        console.error('Search API Error:', error);
        res.status(500).json({ success: false, error: 'Failed to search for resources' });
    }
});

// 5. YouTube Transcript API - Convert videos to study notes
app.post('/api/video/transcript', async (req, res) => {
    try {
        const { url } = req.body;
        
        // Extract video ID from URL
        const videoId = url.includes('youtu.be') 
            ? url.split('/').pop() 
            : url.split('v=')[1]?.split('&')[0];
        
        if (!videoId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid YouTube URL' 
            });
        }
        
        // Get video details
        const videoInfoResponse = await axios.get(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails&key=${process.env.YOUTUBE_API_KEY}`);
        const videoInfo = videoInfoResponse.data.items[0];
        
        // Get transcript
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        const fullText = transcript.map(part => part.text).join(' ');
        
        // Use Gemini to summarize and extract key points
        const summaryPrompt = `Summarize this YouTube video transcript and extract key points:
        
        ${fullText.substring(0, 10000)}`;
        
        const summaryResult = await model.generateContent(summaryPrompt);
        const summaryText = (await summaryResult.response).text();
        
        // Extract summary and key points
        const summary = summaryText.split('Key Points:')[0].trim();
        const keyPointsText = summaryText.split('Key Points:')[1] || '';
        const keyPoints = keyPointsText
            .split('\n')
            .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
            .map(point => point.replace(/^[-•]\s*/, '').trim());
        
        res.json({
            success: true,
            videoTitle: videoInfo.snippet.title,
            duration: videoInfo.contentDetails.duration,
            transcript: fullText,
            summary: summary,
            keyPoints: keyPoints.length > 0 ? keyPoints : ['No key points extracted']
        });
    } catch (error) {
        console.error('YouTube Transcript API Error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate notes from video' });
    }
});

// 6. OpenStreetMap & OpenCage & Weather & Open Charge Map API
app.post('/api/spaces/find', async (req, res) => {
    try {
        const { location, filters } = req.body;
        
        // Geocode the location using OpenCage API
        const geocodeResponse = await axios.get(`https://api.opencagedata.com/geocode/v1/json`, {
            params: {
                q: location,
                key: process.env.OPENCAGE_API_KEY
            }
        });
        
        const coordinates = geocodeResponse.data.results[0].geometry;
        
        // Get weather information
        const weatherResponse = await axios.get(`https://api.weatherapi.com/v1/current.json`, {
            params: {
                key: process.env.WEATHER_API_KEY,
                q: `${coordinates.lat},${coordinates.lng}`
            }
        });
        
        // Search for places using OpenStreetMap Overpass API
        const overpassQuery = `
            [out:json];
            (
                ${filters.libraries ? 'node["amenity"="library"]' : ''}
                ${filters.cafes ? 'node["amenity"="cafe"]' : ''}
                ${filters.coworking ? 'node["amenity"="coworking_space"]' : ''}
            )(around:5000,${coordinates.lat},${coordinates.lng});
            out body;
        `;
        
        const placesResponse = await axios.post('https://overpass-api.de/api/interpreter', overpassQuery);
        
        const spaces = placesResponse.data.elements.map(place => ({
            name: place.tags.name || 'Unnamed place',
            address: `${place.tags['addr:street'] || ''} ${place.tags['addr:housenumber'] || ''}`,
            lat: place.lat,
            lng: place.lon,
            type: place.tags.amenity === 'library' ? 'Library' : 
                 (place.tags.amenity === 'cafe' ? 'Cafe' : 'Coworking Space'),
            distance: calculateDistance(
                coordinates.lat, 
                coordinates.lng, 
                place.lat, 
                place.lon
            )
        }));
        
        // Get charging stations if requested
        let chargingStations = [];
        if (filters.showCharging) {
            const chargingResponse = await axios.get('https://api.openchargemap.io/v3/poi', {
                params: {
                    latitude: coordinates.lat,
                    longitude: coordinates.lng,
                    distance: 5, // 5km radius
                    distanceunit: 'km',
                    maxresults: 20,
                    compact: true,
                    verbose: false,
                    key: process.env.OPEN_CHARGE_MAP_API_KEY
                }
            });
            
            chargingStations = chargingResponse.data.map(station => ({
                name: station.AddressInfo.Title,
                address: `${station.AddressInfo.AddressLine1}, ${station.AddressInfo.Town}`,
                lat: station.AddressInfo.Latitude,
                lng: station.AddressInfo.Longitude,
                chargingType: station.Connections[0]?.ConnectionType?.Title || 'Unknown type'
            }));
        }
        
        res.json({
            success: true,
            coordinates,
            weather: {
                temp_c: weatherResponse.data.current.temp_c,
                condition: weatherResponse.data.current.condition.text,
                icon: weatherResponse.data.current.condition.icon
            },
            spaces,
            chargingStations
        });
    } catch (error) {
        console.error('Location Services API Error:', error);
        res.status(500).json({ success: false, error: 'Failed to find study spaces' });
    }
});

// 7. Composio API - Study planning
app.post('/api/planner/generate', async (req, res) => {
    try {
        const { subject, goal, deadline, studyHours } = req.body;
        
        // Generate study plan using Gemini model
        const prompt = `Create a detailed study plan for the subject "${subject}" with the goal "${goal}". 
        The deadline is ${deadline} and the student has ${studyHours} hours available per week for studying.
        
        Format the response as JSON with the following structure:
        {
            "subject": "${subject}",
            "goal": "${goal}",
            "deadline": "${deadline}",
            "schedule": [
                {
                    "day": "Monday",
                    "sessions": [
                        {
                            "time": "9:00 AM - 10:30 AM",
                            "topic": "Topic name",
                            "duration": 90
                        }
                    ]
                }
            ],
            "topics": [
                {
                    "name": "Topic name",
                    "hours": 5,
                    "progress": 0
                }
            ],
            "resources": [
                "Resource 1",
                "Resource 2"
            ]
        }`;
        
        const result = await model.generateContent(prompt);
        const planText = (await result.response).text();
        
        // Extract the JSON from the response
        const jsonMatch = planText.match(/``````/) || 
                         planText.match(/{[\s\S]*}/) ||
                         planText;
        
        let planData;
        try {
            planData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } catch (e) {
            // If parsing fails, use the text as is
            planData = {
                subject,
                goal,
                deadline,
                schedule: [],
                topics: [],
                resources: []
            };
        }
        
        // Save the plan to the database
        db.run(
            'INSERT INTO study_plans (user_id, subject, goal, deadline, study_hours, plan_data) VALUES (?, ?, ?, ?, ?, ?)',
            ['user123', subject, goal, deadline, studyHours, JSON.stringify(planData)]
        );
        
        res.json({
            success: true,
            ...planData
        });
    } catch (error) {
        console.error('Study Planner Error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate study plan' });
    }
});

// Helper function to calculate distance between coordinates (in km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distance = R * c; // Distance in km
    return Math.round(distance * 10) / 10;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
