// Main JavaScript file for StudyBuddy application

document.addEventListener('DOMContentLoaded', function() {
    // Initialize components
    initAIAssistant();
    initStudyResources();
    initVideoNotes();
    initStudyPlanner();
    
    // Add smooth scrolling for navigation links
    document.querySelectorAll('nav a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            window.scrollTo({
                top: targetSection.offsetTop - 70,
                behavior: 'smooth'
            });
        });
    });

    // Get Started button scrolls to AI Assistant section
    document.querySelector('.cta-button').addEventListener('click', function() {
        window.scrollTo({
            top: document.querySelector('#ai-assistant').offsetTop - 70,
            behavior: 'smooth'
        });
    });
});

// AI Assistant with Grok API integration
function initAIAssistant() {
    const userQuery = document.getElementById('user-query');
    const askAiButton = document.getElementById('ask-ai');
    const generateQuestionsButton = document.getElementById('generate-questions');
    const aiResponse = document.getElementById('ai-response');
    
    if (!askAiButton || !generateQuestionsButton) return;
    
    askAiButton.addEventListener('click', async function() {
        if (!userQuery.value.trim()) {
            alert('Please enter a question or concept');
            return;
        }
        
        aiResponse.innerHTML = '<p>Processing your request...</p>';
        
        try {
            const response = await fetch('/api/ai/explain', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: userQuery.value })
            });
            
            const data = await response.json();
            
            if (data.success) {
                aiResponse.innerHTML = `<div class="explanation">${data.explanation}</div>`;
            } else {
                aiResponse.innerHTML = `<p class="error">Error: ${data.error}</p>`;
            }
        } catch (error) {
            aiResponse.innerHTML = `<p class="error">Error connecting to AI service. Please try again later.</p>`;
            console.error('AI Assistant Error:', error);
        }
    });
    
    generateQuestionsButton.addEventListener('click', async function() {
        if (!userQuery.value.trim()) {
            alert('Please enter a concept to generate similar questions');
            return;
        }
        
        aiResponse.innerHTML = '<p>Generating similar questions...</p>';
        
        try {
            const response = await fetch('/api/ai/generate-questions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ concept: userQuery.value })
            });
            
            const data = await response.json();
            
            if (data.success) {
                let questionsHtml = '<h4>Similar Questions:</h4><ul>';
                data.questions.forEach(question => {
                    questionsHtml += `<li>${question}</li>`;
                });
                questionsHtml += '</ul>';
                aiResponse.innerHTML = questionsHtml;
            } else {
                aiResponse.innerHTML = `<p class="error">Error: ${data.error}</p>`;
            }
        } catch (error) {
            aiResponse.innerHTML = `<p class="error">Error generating questions. Please try again later.</p>`;
            console.error('Question Generation Error:', error);
        }
    });
}

// Study Resources with SerpAPI integration
function initStudyResources() {
    const resourceQuery = document.getElementById('resource-query');
    const searchButton = document.getElementById('search-resources');
    const resultsContainer = document.getElementById('resource-results');
    const tabButtons = document.querySelectorAll('.tab-button');
    
    if (!searchButton || !resultsContainer) return;
    
    // Tab switching functionality
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // If there are already search results, filter them based on the selected tab
            if (resourceQuery.value.trim() && resultsContainer.innerHTML !== '<p class="placeholder">Search results will appear here...</p>') {
                searchResources(resourceQuery.value, this.dataset.tab);
            }
        });
    });
    
    searchButton.addEventListener('click', function() {
        if (!resourceQuery.value.trim()) {
            alert('Please enter a search query');
            return;
        }
        
        const activeTab = document.querySelector('.tab-button.active').dataset.tab;
        searchResources(resourceQuery.value, activeTab);
    });
    
    async function searchResources(query, resourceType) {
        resultsContainer.innerHTML = '<p>Searching for resources...</p>';
        
        try {
            const response = await fetch(`/api/resources/search?query=${encodeURIComponent(query)}&type=${resourceType}`);
            const data = await response.json();
            
            if (data.success) {
                if (data.results.length === 0) {
                    resultsContainer.innerHTML = '<p>No results found. Try a different search term.</p>';
                    return;
                }
                
                let resultsHtml = '<div class="search-results">';
                data.results.forEach(result => {
                    resultsHtml += `
                        <div class="result-item">
                            <h3>${result.title}</h3>
                            <p>${result.snippet}</p>
                            <div class="result-meta">
                                <span class="source">${result.source}</span>
                                ${result.date ? `<span class="date">${result.date}</span>` : ''}
                            </div>
                        </div>
                    `;
                });
                resultsHtml += '</div>';
                resultsContainer.innerHTML = resultsHtml;
            } else {
                resultsContainer.innerHTML = `<p class="error">Error: ${data.error}</p>`;
            }
        } catch (error) {
            resultsContainer.innerHTML = `<p class="error">Error searching for resources. Please try again later.</p>`;
            console.error('Resource Search Error:', error);
        }
    }
}

// Video Notes with Grok API
function initVideoNotes() {
    const videoUrl = document.getElementById('video-url');
    const generateNotesButton = document.getElementById('generate-notes');
    const notesContainer = document.getElementById('video-notes-result');
    
    if (!generateNotesButton || !notesContainer) return;
    
    generateNotesButton.addEventListener('click', async function() {
        if (!videoUrl.value.trim()) {
            alert('Please enter a YouTube video URL');
            return;
        }
        
        notesContainer.innerHTML = '<p>Generating notes from video...</p>';
        
        try {
            const response = await fetch('/api/video/notes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: videoUrl.value })
            });
            
            const data = await response.json();
            
            if (data.success) {
                let notesHtml = `
                    <div class="video-info">
                        <h3>${data.videoTitle}</h3>
                    </div>
                    <div class="summary">
                        <h4>Summary:</h4>
                        <p>${data.summary}</p>
                    </div>
                    <div class="key-points">
                        <h4>Key Points:</h4>
                        <ul>
                `;
                
                data.keyPoints.forEach(point => {
                    notesHtml += `<li>${point}</li>`;
                });
                
                notesHtml += `
                        </ul>
                    </div>
                `;
                
                notesContainer.innerHTML = notesHtml;
            } else {
                notesContainer.innerHTML = `<p class="error">Error: ${data.error}</p>`;
            }
        } catch (error) {
            notesContainer.innerHTML = `<p class="error">Error generating notes. Please try again later.</p>`;
            console.error('Video Notes Error:', error);
        }
    });
}

// Study Planner with Grok API
function initStudyPlanner() {
    const plannerForm = document.getElementById('planner-form');
    const studyPlan = document.getElementById('study-plan');
    
    if (!plannerForm || !studyPlan) return;
    
    plannerForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const subject = document.getElementById('subject').value;
        const goal = document.getElementById('goal').value;
        const deadline = document.getElementById('deadline').value;
        const studyHours = document.getElementById('study-hours').value;
        
        if (!subject || !goal || !deadline || !studyHours) {
            alert('Please fill in all fields');
            return;
        }
        
        studyPlan.innerHTML = '<p>Generating your study plan...</p>';
        
        try {
            const response = await fetch('/api/planner/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    subject,
                    goal,
                    deadline,
                    studyHours
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                let planHtml = `
                    <div class="plan-header">
                        <h3>${data.subject} Study Plan</h3>
                        <p class="plan-goal">Goal: ${data.goal}</p>
                        <p class="plan-deadline">Deadline: ${new Date(data.deadline).toLocaleDateString()}</p>
                    </div>
                    <div class="plan-schedule">
                        <h4>Weekly Schedule:</h4>
                        <div class="schedule-grid">
                `;
                
                data.schedule.forEach(day => {
                    planHtml += `
                        <div class="schedule-day">
                            <h5>${day.day}</h5>
                            <div class="day-sessions">
                    `;
                    
                    day.sessions.forEach(session => {
                        planHtml += `
                            <div class="session">
                                <span class="session-time">${session.time}</span>
                                <span class="session-topic">${session.topic}</span>
                                <span class="session-duration">${session.duration} min</span>
                            </div>
                        `;
                    });
                    
                    planHtml += `
                            </div>
                        </div>
                    `;
                });
                
                planHtml += `
                        </div>
                    </div>
                    <div class="plan-topics">
                        <h4>Topics Breakdown:</h4>
                        <ul>
                `;
                
                data.topics.forEach(topic => {
                    planHtml += `
                        <li>
                            <span class="topic-name">${topic.name}</span>
                            <span class="topic-hours">${topic.hours} hours</span>
                            <div class="topic-progress">
                                <div class="progress-bar" style="width: ${topic.progress}%"></div>
                            </div>
                        </li>
                    `;
                });
                
                planHtml += `
                        </ul>
                    </div>
                    <div class="plan-resources">
                        <h4>Recommended Resources:</h4>
                        <ul>
                `;
                
                data.resources.forEach(resource => {
                    planHtml += `<li>${resource}</li>`;
                });
                
                planHtml += `
                        </ul>
                    </div>
                    <button id="export-plan" class="export-button">Export Plan</button>
                `;
                
                studyPlan.innerHTML = planHtml;
                
                // Add event listener for export button
                document.getElementById('export-plan').addEventListener('click', function() {
                    const planText = `
                        ${data.subject} Study Plan
                        
                        Goal: ${data.goal}
                        Deadline: ${new Date(data.deadline).toLocaleDateString()}
                        
                        Weekly Schedule:
                        ${data.schedule.map(day => `
                            ${day.day}:
                            ${day.sessions.map(session => `  - ${session.time}: ${session.topic} (${session.duration} min)`).join('\n')}
                        `).join('\n')}
                        
                        Topics:
                        ${data.topics.map(topic => `- ${topic.name}: ${topic.hours} hours`).join('\n')}
                        
                        Recommended Resources:
                        ${data.resources.map(resource => `- ${resource}`).join('\n')}
                    `;
                    
                    const blob = new Blob([planText], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${data.subject.replace(/\s+/g, '_')}_study_plan.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                });
            } else {
                studyPlan.innerHTML = `<p class="error">Error: ${data.error}</p>`;
            }
        } catch (error) {
            studyPlan.innerHTML = `<p class="error">Error generating study plan. Please try again later.</p>`;
            console.error('Study Planner Error:', error);
        }
    });
}
