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
        const totalDistance = route.routes[0].legs[0].distance.value; // Distance in meters
        
        // Calculate 10km intervals
        const intervalDistance = 10000; // 10km in meters
        const intervals = Math.ceil(totalDistance / intervalDistance);
        
        // Sample points at 10km intervals
        const samplePoints = [];
        for (let i = 0; i < intervals; i++) {
            const distanceRatio = (i + 1) * intervalDistance / totalDistance;
            const pointIndex = Math.floor(distanceRatio * routePath.length);
            if (pointIndex < routePath.length) {
                samplePoints.push({
                    location: routePath[pointIndex],
                    distance: (i + 1) * 10, // Distance in km
                    interval: i + 1
                });
            }
        }

        // Search for restaurants at each interval
        for (const pointData of samplePoints) {
            try {
                const nearbyRestaurants = await this.searchNearbyRestaurants(pointData.location);
                // Take only top 3 restaurants per interval, sorted by rating
                const topRestaurants = nearbyRestaurants
                    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
                    .slice(0, 3)
                    .map(restaurant => ({
                        ...restaurant,
                        distanceFromStart: pointData.distance,
                        interval: pointData.interval
                    }));
                restaurants.push(...topRestaurants);
            } catch (error) {
                console.warn('Error searching restaurants near point:', error);
            }
        }

        // Remove duplicates and sort by distance from start
        const uniqueRestaurants = this.removeDuplicateRestaurants(restaurants);
        return uniqueRestaurants.sort((a, b) => a.distanceFromStart - b.distanceFromStart);
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

        // Add restaurant markers to map
        this.addRestaurantMarkers(restaurants);

        // Display restaurants
        this.displayRestaurants(restaurants);
    }

    addRestaurantMarkers(restaurants) {
        if (!this.map || !restaurants.length) return;

        // Create custom marker icons
        const restaurantIcon = {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="16" cy="16" r="14" fill="#FF6B6B" stroke="#fff" stroke-width="2"/>
                    <text x="16" y="20" text-anchor="middle" fill="white" font-size="16" font-weight="bold">🍽️</text>
                </svg>
            `),
            scaledSize: new google.maps.Size(32, 32),
            anchor: new google.maps.Point(16, 16)
        };

        // Add markers for each restaurant
        restaurants.forEach((restaurant, index) => {
            if (restaurant.geometry && restaurant.geometry.location) {
                const marker = new google.maps.Marker({
                    position: restaurant.geometry.location,
                    map: this.map,
                    icon: restaurantIcon,
                    title: restaurant.name,
                    animation: google.maps.Animation.DROP
                });

                // Create info window for each restaurant
                const infoWindow = new google.maps.InfoWindow({
                    content: `
                        <div style="padding: 10px; max-width: 250px;">
                            <h3 style="margin: 0 0 8px 0; color: #333;">${restaurant.name}</h3>
                            <p style="margin: 0 0 5px 0; color: #666;">
                                <strong>Rating:</strong> ${restaurant.rating ? restaurant.rating.toFixed(1) : 'N/A'} ⭐
                            </p>
                            <p style="margin: 0 0 5px 0; color: #666;">
                                <strong>Distance:</strong> ${restaurant.distanceFromStart}km from start
                            </p>
                            <p style="margin: 0 0 5px 0; color: #666;">
                                <strong>Address:</strong> ${restaurant.address}
                            </p>
                            <p style="margin: 0; color: #666;">
                                <strong>Price:</strong> ${this.getPriceLevel(restaurant.priceLevel)}
                            </p>
                        </div>
                    `
                });

                // Add click listener to marker
                marker.addListener('click', () => {
                    infoWindow.open(this.map, marker);
                });
            }
        });
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

        // Group restaurants by interval
        const groupedRestaurants = restaurants.reduce((groups, restaurant) => {
            const interval = restaurant.interval || 1;
            if (!groups[interval]) {
                groups[interval] = [];
            }
            groups[interval].push(restaurant);
            return groups;
        }, {});

        let restaurantsHTML = '';

        // Display restaurants grouped by 10km intervals
        Object.keys(groupedRestaurants).sort((a, b) => parseInt(a) - parseInt(b)).forEach(interval => {
            const intervalRestaurants = groupedRestaurants[interval];
            const distance = intervalRestaurants[0].distanceFromStart;
            
            restaurantsHTML += `
                <div class="interval-section">
                    <h4 class="interval-title">📍 ${distance}km from start</h4>
                    <div class="interval-restaurants">
                        ${intervalRestaurants.map(restaurant => {
                            const rating = restaurant.rating ? restaurant.rating.toFixed(1) : 'N/A';
                            const stars = this.generateStars(restaurant.rating || 0);
                            const priceLevel = this.getPriceLevel(restaurant.priceLevel);
                            const types = restaurant.types ? restaurant.types.slice(0, 3) : [];

                            return `
                                <div class="restaurant-item">
                                    <div class="restaurant-name">${restaurant.name}</div>
                                    <div class="restaurant-rating">
                                        <span class="stars">${stars}</span>
                                        <span class="rating-text">${rating} ⭐</span>
                                    </div>
                                    <div class="restaurant-address">${restaurant.address}</div>
                                    <div class="restaurant-price">${priceLevel}</div>
                                    <div class="restaurant-types">
                                        ${types.map(type => `<span class="type-tag">${type.replace(/_/g, ' ')}</span>`).join('')}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });

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

// Global callback function for Google Maps API
function initApp() {
    // Check if all required libraries are loaded
    if (typeof google !== 'undefined' && google.maps && google.maps.places && google.maps.DirectionsService) {
        new RouteRestaurantFinder();
    } else {
        console.error('Required Google Maps libraries not loaded');
        const errorElement = document.getElementById('error');
        const errorMessage = document.getElementById('errorMessage');
        if (errorElement && errorMessage) {
            errorElement.style.display = 'block';
            errorMessage.textContent = 'Required Google Maps libraries failed to load. Please check your API key and enabled APIs.';
        }
    }
}

// Fallback initialization for DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // If Google Maps API is already loaded, initialize immediately
    if (typeof google !== 'undefined' && google.maps) {
        initApp();
    }
    // Otherwise, wait for the callback
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
