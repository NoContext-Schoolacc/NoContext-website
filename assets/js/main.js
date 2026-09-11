// Shared UI Logic

document.addEventListener('DOMContentLoaded', () => {
    // FAQ Accordion
    const faqQuestions = document.querySelectorAll('.faq-question');
    faqQuestions.forEach(q => {
        q.addEventListener('click', () => {
            const answer = q.nextElementSibling;
            if (!answer) return;

            const isOpen = answer.style.display === 'block';
            document.querySelectorAll('.faq-answer').forEach(a => {
                a.style.display = 'none';
            });

            answer.style.display = isOpen ? 'none' : 'block';
        });
    });

    // Smooth Scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const selector = this.getAttribute('href');
            if (!selector || selector === '#') return;

            const target = document.querySelector(selector);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});

// Helper for copying text to clipboard
async function copyToClipboard(text, btnElement) {
    if (typeof text !== 'string' || !btnElement || !navigator.clipboard) return;

    try {
        await navigator.clipboard.writeText(text);
        const originalText = btnElement.textContent;
        btnElement.textContent = 'Copied!';
        setTimeout(() => {
            btnElement.textContent = originalText;
        }, 2000);
    } catch {
        // Do not expose clipboard errors or sensitive text in console logs.
    }
}
