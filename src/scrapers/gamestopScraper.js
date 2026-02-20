const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');

class GamestopScraper extends BaseScraper {
  constructor() {
    super('gamestop', 'https://www.gamestop.com');
  }

  async scrapeProduct(url) {
    try {
      const response = await this.makeRequest(url);
      const $ = cheerio.load(response.data);

      // GameStop specific selectors
      const title = $('h1.pdp-product-name').text().trim() ||
                    $('[data-testid="pdp-product-title"]').text().trim() ||
                    $('.product-name h1').text().trim() ||
                    $('h1').first().text().trim();

      // Price extraction
      let price = null;
      const priceElements = [
        '.pricing.notranslate .sr-only',
        '.actual-price',
        '.price-display',
        '[data-testid="product-price"]'
      ];

      for (const selector of priceElements) {
        const priceText = $(selector).text().trim();
        if (priceText) {
          const priceMatch = priceText.match(/\$?(\d+\.?\d*)/);
          if (priceMatch) {
            price = parseFloat(priceMatch[1]);
            break;
          }
        }
      }

      // Image URL
      const imageUrl = $('.pdp-product-image img').attr('src') ||
                      $('[data-testid="product-image"] img').attr('src') ||
                      $('.product-image img').attr('src') ||
                      $('.slider-frame img').first().attr('src');

      // Availability - GameStop specific availability checks
      const availabilityIndicators = [
        '.add-to-cart-buttons button:not(:disabled)',
        '.btn-add-to-cart:not(.disabled)',
        '[data-testid="add-to-cart-button"]:not([disabled])'
      ];

      let availability = false;
      for (const selector of availabilityIndicators) {
        if ($(selector).length > 0) {
          availability = true;
          break;
        }
      }

      // Check for out of stock indicators
      const outOfStockIndicators = [
        '.out-of-stock',
        '.not-available',
        '.sold-out',
        '[data-testid="out-of-stock"]'
      ];

      for (const selector of outOfStockIndicators) {
        if ($(selector).length > 0) {
          availability = false;
          break;
        }
      }

      // Check availability text
      const availabilityText = $('.availability-msg, .stock-msg, .pdp-availability').text().toLowerCase();
      if (availabilityText.includes('out of stock') || 
          availabilityText.includes('not available') || 
          availabilityText.includes('sold out')) {
        availability = false;
      }

      return {
        title: title || 'Unknown Product',
        price: price || 0,
        imageUrl: imageUrl ? this.resolveUrl(imageUrl) : null,
        availability: !!availability,
        url: url,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error(`GameStop scraping error: ${error.message}`);
      throw error;
    }
  }

  async searchProducts(query, limit = 10) {
    try {
      const searchUrl = `${this.baseUrl}/search/?q=${encodeURIComponent(query)}`;
      const response = await this.makeRequest(searchUrl);
      const $ = cheerio.load(response.data);
      
      const products = [];
      
      $('.grid-tile, .product-tile, .search-result-item').slice(0, limit).each((i, element) => {
        const $item = $(element);
        
        const title = $item.find('.product-tile-title, .product-name, h3 a').text().trim();
        
        const priceText = $item.find('.price, .pricing, .product-price').text().trim();
        const priceMatch = priceText.match(/\$?(\d+\.?\d*)/);
        const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
        
        const relativeUrl = $item.find('a').first().attr('href');
        const productUrl = relativeUrl ? this.resolveUrl(relativeUrl) : null;
        
        const imageUrl = $item.find('img').attr('src') || $item.find('img').attr('data-src');
        
        if (title && productUrl) {
          products.push({
            title,
            price,
            url: productUrl,
            imageUrl: imageUrl ? this.resolveUrl(imageUrl) : null,
            availability: true // Assume available if listed in search
          });
        }
      });
      
      return products;
      
    } catch (error) {
      this.logger.error(`GameStop search error: ${error.message}`);
      throw error;
    }
  }

  validateUrl(url) {
    return url.includes('gamestop.com') && (
      url.includes('/product/') || 
      url.includes('/games/') ||
      url.includes('/collectibles/') ||
      url.includes('/search/')
    );
  }
}

module.exports = GamestopScraper;