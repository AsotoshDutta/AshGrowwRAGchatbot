// Mutual Fund FAQ Assistant - Interactive Client Logic

document.addEventListener('DOMContentLoaded', () => {
    // 1. Session Storage reset for absolute compliance privacy
    sessionStorage.clear();

    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatMessages = document.getElementById('chat-messages');
    const welcomeCard = document.getElementById('welcome-card');
    const themeToggle = document.getElementById('theme-toggle');
    const sendButton = document.getElementById('send-button');
    const backButton = document.getElementById('back-button-home');

    // 2. Light/Dark Theme Toggle
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const themeIcon = themeToggle.querySelector('.theme-icon');
        if (document.body.classList.contains('light-theme')) {
            themeIcon.textContent = '🌙';
            themeToggle.title = 'Switch to Dark Theme';
        } else {
            themeIcon.textContent = '☀';
            themeToggle.title = 'Switch to Light Theme';
        }
    });

    // 3. Example Chips Event Handlers
    const chips = document.querySelectorAll('.chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const queryText = chip.getAttribute('data-query');
            userInput.value = queryText;
            submitQuery(queryText);
        });
    });

    // 4. Form Submit Listener
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = userInput.value.trim();
        if (text) {
            submitQuery(text);
        }
    });

    // 5. Back to Home Button Listener
    if (backButton) {
        backButton.addEventListener('click', () => {
            // Restore welcome card
            if (welcomeCard) {
                welcomeCard.style.display = 'block';
            }
            // Clear message history
            const wrappers = chatMessages.querySelectorAll('.message-wrapper');
            wrappers.forEach(w => w.remove());
            // Hide back button
            backButton.style.display = 'none';
        });
    }

    // Helper to escape HTML to prevent XSS vulnerability
    function escapeHTML(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Render message wrapper
    function appendMessage(sender, content, citationUrl = null, lastUpdated = null) {
        // Hide welcome card upon first message exchange
        if (welcomeCard) {
            welcomeCard.style.display = 'none';
        }

        // Show back button
        if (backButton) {
            backButton.style.display = 'flex';
        }

        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${sender}`;

        const header = document.createElement('div');
        header.className = 'message-header';
        header.textContent = sender === 'user' ? 'YOU' : 'FAQ ASSISTANT';
        wrapper.appendChild(header);

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        
        // Use textContent or escaped text to prevent XSS
        const textSpan = document.createElement('span');
        textSpan.textContent = content;
        bubble.appendChild(textSpan);

        // Append citation block if provided
        if (sender === 'bot' && citationUrl) {
            const citationBlock = document.createElement('div');
            citationBlock.className = 'citation-block';

            // Create clickable citation link
            const link = document.createElement('a');
            link.className = 'source-tag';
            link.href = citationUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            
            // Clean up display name of link
            let linkLabel = 'Official Source Reference';
            if (citationUrl.includes('pdf')) {
                const parts = citationUrl.split('/');
                linkLabel = `📄 ${parts[parts.length - 1]}`;
            } else if (citationUrl.includes('sebi.gov.in')) {
                linkLabel = '🏛 SEBI RIA Advisor Directory';
            } else if (citationUrl.includes('amfiindia.com')) {
                linkLabel = '📈 AMFI Investor Corner';
            } else {
                linkLabel = '🔗 sbimf.com Official Portal';
            }

            link.textContent = linkLabel;
            citationBlock.appendChild(link);

            // Create last updated date text
            if (lastUpdated) {
                const footerText = document.createElement('div');
                footerText.className = 'last-updated-footer';
                footerText.textContent = `Last updated from sources: ${lastUpdated}`;
                citationBlock.appendChild(footerText);
            }

            bubble.appendChild(citationBlock);
        }

        wrapper.appendChild(bubble);
        chatMessages.appendChild(wrapper);

        // Auto Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Append loading dots
    function appendLoading() {
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper bot temp-loading';

        const header = document.createElement('div');
        header.className = 'message-header';
        header.textContent = 'FAQ ASSISTANT';
        wrapper.appendChild(header);

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'typing-dot';
            indicator.appendChild(dot);
        }

        bubble.appendChild(indicator);
        wrapper.appendChild(bubble);
        chatMessages.appendChild(wrapper);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return wrapper;
    }

    // Submit handler
    async function submitQuery(queryText) {
        // Clear input form
        userInput.value = '';
        userInput.focus();
        
        // Disable controls during load
        userInput.disabled = true;
        sendButton.disabled = true;

        // Render user message bubble
        appendMessage('user', queryText);

        // Render loading animation bubble
        const loaderBubble = appendLoading();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: queryText })
            });

            // Remove loading bubble
            if (loaderBubble && loaderBubble.parentNode) {
                loaderBubble.parentNode.removeChild(loaderBubble);
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Server error occurred.');
            }

            const data = await response.json();
            
            // Render bot answer
            appendMessage('bot', data.answer, data.citationUrl, data.lastUpdated);

        } catch (error) {
            console.error('[CLIENT] Query error:', error);
            
            // Remove loading bubble
            if (loaderBubble && loaderBubble.parentNode) {
                loaderBubble.parentNode.removeChild(loaderBubble);
            }

            appendMessage('bot', `Sorry, I encountered an error: ${error.message}. Please verify that your backend dev server is running and try again.`);
        } finally {
            // Re-enable controls
            userInput.disabled = false;
            sendButton.disabled = false;
            userInput.focus();
        }
    }
});
