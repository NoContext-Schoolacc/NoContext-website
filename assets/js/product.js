const PRODUCTS = {
    external: {
        name: "NoContext External",
        description: "A professional-grade external software tool for Roblox.",
        price: "FREE",
        buttonText: "Download",
        comingSoon: false,
        uiImage: null,
        features: [
            { icon: "fa-bolt", title: "Lightweight", desc: "Designed for a responsive software experience." },
            { icon: "fa-mouse-pointer", title: "Convenient controls", desc: "Simple controls designed for everyday use." },
            { icon: "fa-gear", title: "Custom presets", desc: "Save and load supported configurations quickly." }
        ]
    },
    executor: {
        name: "NoContext Executor",
        description: "A software project for Roblox that is currently in development.",
        price: "COMING SOON",
        buttonText: "Coming Soon",
        comingSoon: true,
        uiImage: null,
        features: [
            { icon: "fa-code", title: "Development focused", desc: "Designed around a clean and straightforward interface." },
            { icon: "fa-microchip", title: "Performance", desc: "Built with a focus on responsive software behavior." },
            { icon: "fa-folder-open", title: "Organized", desc: "Keep supported tools and configurations easy to manage." }
        ]
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    if (productId && PRODUCTS[productId]) renderProduct(PRODUCTS[productId], productId);
    else window.location.replace('../roblox/');
});

function renderProduct(product, id) {
    document.title = `${product.name} | NoContext`;
    const title = document.getElementById('product-title');
    const description = document.getElementById('product-desc');
    const badge = document.getElementById('product-badge');
    const button = document.getElementById('get-key-btn');
    const featureContainer = document.getElementById('feature-list');
    if (!title || !description || !badge || !button || !featureContainer) return;

    title.textContent = product.name;
    description.textContent = product.description;
    button.textContent = product.buttonText;

    if (product.comingSoon) {
        button.href = '../product/';
        button.setAttribute('aria-disabled', 'true');
        button.classList.add('btn-disabled');
        badge.textContent = 'COMING SOON';
        badge.classList.add('badge-muted');
    } else {
        button.removeAttribute('aria-disabled');
        button.classList.remove('btn-disabled');
        button.href = `../key/?product=${encodeURIComponent(id)}`;
        badge.textContent = product.price;
        badge.classList.remove('badge-muted');
    }

    featureContainer.replaceChildren();
    product.features.forEach(feature => {
        const item = document.createElement('div');
        item.className = 'feature-item-detailed';
        const icon = document.createElement('i');
        icon.className = `fas ${feature.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        const heading = document.createElement('h3');
        heading.textContent = feature.title;
        const desc = document.createElement('p');
        desc.className = 'feature-desc';
        desc.textContent = feature.desc;
        item.append(icon, heading, desc);
        featureContainer.appendChild(item);
    });

    if (product.uiImage) {
        const container = document.getElementById('product-ui-container');
        if (container) {
            const image = document.createElement('img');
            image.src = product.uiImage;
            image.alt = `${product.name} UI`;
            container.replaceChildren(image);
        }
    }
}
