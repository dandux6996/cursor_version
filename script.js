class RouteRestaurantFinder {
    constructor() {
        this.map = null;
        this.directionsService = null;
        this.directionsRenderer = null;
        this.placesService = null;
        this.autocompleteStart = null;
        this.autocompleteEnd = null;
        
        this.init();
    }

    init() {
        this.directionsService = new google.maps.DirectionsService();
        this.directionsRenderer = new google.maps.DirectionsRenderer();
        
        // Initialize autocomplete for input fields
        this.initAutocomplete();
        
        // Set up event listeners
        document.getElementById('findRoute').addEventListener('click', () => this.findRouteAndRestaurants());
        
        // Allow Enter key to trigger search
        document.getElementById('startLocation').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.findRouteAndRestaurants();
        });
        document.getElementById('endLocation').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.findRouteAndRestaurants();
        });
    }

    initAutocomplete() {
        const startInput = document.getElementById('startLocation');
        const endInput = document.getElementById('endLocation');

        this.autocompleteStart = new google.maps.places.Autocomplete(startInput);
        this.autocompleteEnd = new google.maps.places.Autocomplete(endInput);
    }

    async findRouteAndRestaurants() {
        const startLocation = document.getElementById('startLocation').value.trim();
        const endLocation = document.getElementById('endLocation').value.trim();

        if (!startLocation || !endLocation) {
            this.showError('Please enter both starting point and destination.');
            return;
        }

        this.showLoading(true);
        this.hideError();

        try {
            // Get coordinates for both locations
            const startCoords = await this.getCoordinates(startLocation);
            const endCoords = await this.getCoordinates(endLocation);

            if (!startCoords || !endCoords) {
                throw new Error('Could not find coordinates for one or both locations.');
            }

            // Initialize map
            this.initMap(startCoords);

            // Get route
            const route = await this.getRoute(startCoords, endCoords);
            
            // Find restaurants along the route
            const restaurants = await this.findRestaurantsAlongRoute(route);

            // Display results
            this.displayResults(route, restaurants);

        } catch (error) {
            console.error('Error:', error);
            this.showError('An error occurred while finding your route. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    getCoordinates(address) {
        return new Promise((resolve) => {
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ address: address }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    resolve(results[0].geometry.location);
                } else {
                    resolve(null);
                }
            });
        });
    }

    initMap(center) {
        const mapElement = document.getElementById('map');
        
        this.map = new google.maps.Map(mapElement, {
            zoom: 10,
            center: center,
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            styles: [
                {
                    featureType: 'poi',
                    elementType: 'labels',
                    stylers: [{ visibility: 'off' }]
                }
            ]
        });

        this.directionsRenderer.setMap(this.map);
        this.placesService = new google.maps.places.PlacesService(this.map);
    }

    getRoute(start, end) {
        return new Promise((resolve, reject) => {
            const request = {
                origin: start,
                destination: end,
                travelMode: google.maps.TravelMode.DRIVING,
                provideRouteAlternatives: false,
                avoidHighways: false,
                avoidTolls: false
            };

            this.directionsService.route(request, (result, status) => {
                if (status === 'OK') {
                    this.directionsRenderer.setDirections(result);
                    resolve(result);
                } else {
                    reject(new Error('Directions request failed: ' + status));
                }
            });
        });
    }

    async findRestaurantsAlongRoute(route) {
        const restaurants = [];
        const routePath = route.routes[0].overview_path;
        
        // Sample points along the route (every 5th point to avoid too many requests)
        const samplePoints = routePath.filter((_, index) => index % 5 === 0);
        
        // Limit to first 10 points to avoid API quota issues
        const limitedPoints = samplePoints.slice(0, 10);

        for (const point of limitedPoints) {
            try {
                const nearbyRestaurants = await this.searchNearbyRestaurants(point);
                restaurants.push(...nearbyRestaurants);
            } catch (error) {
                console.warn('Error searching restaurants near point:', error);
            }
        }

        // Remove duplicates and sort by rating
        const uniqueRestaurants = this.removeDuplicateRestaurants(restaurants);
        return uniqueRestaurants.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    searchNearbyRestaurants(location) {
        return new Promise((resolve) => {
            const request = {
                location: location,
                radius: 2000, // 2km radius
                type: 'restaurant',
                keyword: 'restaurant food dining'
            };

            this.placesService.nearbySearch(request, (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK) {
                    const restaurants = results.map(place => ({
                        name: place.name,
                        rating: place.rating,
                        priceLevel: place.price_level,
                        address: place.vicinity,
                        placeId: place.place_id,
                        types: place.types,
                        geometry: place.geometry
                    }));
                    resolve(restaurants);
                } else {
                    resolve([]);
                }
            });
        });
    }

    removeDuplicateRestaurants(restaurants) {
        const seen = new Set();
        return restaurants.filter(restaurant => {
            const key = restaurant.placeId || restaurant.name;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    displayResults(route, restaurants) {
        // Show results section
        document.getElementById('results').style.display = 'block';

        // Display route information
        this.displayRouteInfo(route);

        // Display restaurants
        this.displayRestaurants(restaurants);
    }

    displayRouteInfo(route) {
        const routeDetails = document.getElementById('routeDetails');
        const routeData = route.routes[0];
        const leg = routeData.legs[0];

        const distance = leg.distance.text;
        const duration = leg.duration.text;
        const startAddress = leg.start_address;
        const endAddress = leg.end_address;

        routeDetails.innerHTML = `
            <div class="route-detail-item">
                <strong>Distance</strong>
                ${distance}
            </div>
            <div class="route-detail-item">
                <strong>Duration</strong>
                ${duration}
            </div>
            <div class="route-detail-item">
                <strong>From</strong>
                ${startAddress}
            </div>
            <div class="route-detail-item">
                <strong>To</strong>
                ${endAddress}
            </div>
        `;
    }

    displayRestaurants(restaurants) {
        const restaurantsList = document.getElementById('restaurantsList');
        
        if (restaurants.length === 0) {
            restaurantsList.innerHTML = '<div class="no-restaurants">No restaurants found along this route.</div>';
            return;
        }

        const restaurantsHTML = restaurants.map(restaurant => {
            const rating = restaurant.rating ? restaurant.rating.toFixed(1) : 'N/A';
            const stars = this.generateStars(restaurant.rating || 0);
            const priceLevel = this.getPriceLevel(restaurant.priceLevel);
            const types = restaurant.types ? restaurant.types.slice(0, 3) : [];

            return `
                <div class="restaurant-item">
                    <div class="restaurant-name">${restaurant.name}</div>
                    <div class="restaurant-rating">
                        <span class="stars">${stars}</span>
                        <span class="rating-text">${rating} (${restaurant.rating ? Math.round(restaurant.rating * 10) : 0} reviews)</span>
                    </div>
                    <div class="restaurant-address">${restaurant.address}</div>
                    <div class="restaurant-price">${priceLevel}</div>
                    <div class="restaurant-types">
                        ${types.map(type => `<span class="type-tag">${type.replace(/_/g, ' ')}</span>`).join('')}
                    </div>
                </div>
            `;
        }).join('');

        restaurantsList.innerHTML = restaurantsHTML;
    }

    generateStars(rating) {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
        
        return '★'.repeat(fullStars) + 
               (hasHalfStar ? '☆' : '') + 
               '☆'.repeat(emptyStars);
    }

    getPriceLevel(priceLevel) {
        if (priceLevel === undefined || priceLevel === null) return 'Price not available';
        return '$'.repeat(priceLevel) + ' • ' + 
               ['Budget', 'Moderate', 'Expensive', 'Very Expensive'][priceLevel - 1] || 'Price not available';
    }

    showLoading(show) {
        document.getElementById('loading').style.display = show ? 'block' : 'none';
    }

    showError(message) {
        const errorElement = document.getElementById('error');
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.textContent = message;
        errorElement.style.display = 'block';
    }

    hideError() {
        document.getElementById('error').style.display = 'none';
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Google Maps API to load
    const checkGoogleMaps = () => {
        if (typeof google !== 'undefined' && google.maps) {
            new RouteRestaurantFinder();
        } else {
            // Check again after a short delay
            setTimeout(checkGoogleMaps, 100);
        }
    };
    
    // Start checking for Google Maps API
    checkGoogleMaps();
    
    // Set a timeout to show error if API doesn't load within 10 seconds
    setTimeout(() => {
        if (typeof google === 'undefined' || !google.maps) {
            const errorElement = document.getElementById('error');
            const errorMessage = document.getElementById('errorMessage');
            if (errorElement && errorMessage) {
                errorElement.style.display = 'block';
                errorMessage.textContent = 'Google Maps API failed to load. Please check your API key and internet connection.';
            }
        }
    }, 10000);
});

// Add some utility functions for better user experience
document.addEventListener('DOMContentLoaded', () => {
    // Add input validation
    const inputs = document.querySelectorAll('input[type="text"]');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            if (input.value.trim()) {
                input.style.borderColor = '#28a745';
            } else {
                input.style.borderColor = '#e1e5e9';
            }
        });
    });
});