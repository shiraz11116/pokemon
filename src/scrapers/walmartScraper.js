const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');

class WalmartScraper extends BaseScraper {
  constructor() {
    super('walmart', 'https://www.walmart.com');
  }

  async scrapeProduct(url) {
    try {
      const response = await this.makeRequest(url);
      const $ = cheerio.load(response.data);

      // Walmart specific selectors
      const title = $('[data-automation-id="product-title"]').text().trim() ||
                    $('h1[data-testid="product-title"]').text().trim() ||
                    $('h1').first().text().trim();

      // Price extraction
      let price = null;
      const priceElements = [
        '[data-testid="price-current"]',
        '[data-automation-id="price"]',
        '.price-current',
        '.price-characteristic'
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
      const imageUrl = $('[data-testid="hero-image-container"] img').attr('src') ||
                      $('[data-automation-id="product-image"] img').attr('src') ||
                      $('.prod-ProductImage img').attr('src');

      // Availability
      const availabilityElement = $('[data-automation-id="fulfillment-add-to-cart"]').length > 0 ||
                                 $('[data-testid="add-to-cart-button"]').length > 0 ||
                                 $('.add-to-cart-button').length > 0;

      const availability = availabilityElement && 
                          !$('.out-of-stock').length && 
                          !$('[data-automation-id="out-of-stock"]').length;

      return {
        title: title || 'Unknown Product',
        price: price || 0,
        imageUrl: imageUrl ? this.resolveUrl(imageUrl) : null,
        availability: !!availability,
        url: url,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error(`Walmart scraping error: ${error.message}`);
      throw error;
    }
  }

  async searchProducts(query, limit = 10) {
    try {
      const searchUrl = `${this.baseUrl}/search?query=${encodeURIComponent(query)}`;
      const response = await this.makeRequest(searchUrl);
      const $ = cheerio.load(response.data);
      
      const products = [];
      
      $('[data-testid="item-stack"] [data-testid="list-view"]').slice(0, limit).each((i, element) => {
        const $item = $(element);
        
        const title = $item.find('[data-automation-id="product-title"]').text().trim() ||
                     $item.find('span[data-testid="product-title"]').text().trim();
        
        const priceText = $item.find('[data-automation-id="price"]').text().trim() ||
                         $item.find('.price').text().trim();
        
        const priceMatch = priceText.match(/\$?(\d+\.?\d*)/);
        const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
        
        const relativeUrl = $item.find('a').first().attr('href');
        const productUrl = relativeUrl ? this.resolveUrl(relativeUrl) : null;
        
        const imageUrl = $item.find('img').attr('src');
        
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
      this.logger.error(`Walmart search error: ${error.message}`);
      throw error;
    }
  }

  validateUrl(url) {
    return url.includes('walmart.com') && (
      url.includes('/ip/') || 
      url.includes('/product/') ||
      url.includes('/search')
    );
  }
}

module.exports = WalmartScraper;