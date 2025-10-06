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
        const allRestaurants = [];
        const routePath = route.routes[0].overview_path;
        const totalDistance = route.routes[0].legs[0].distance.value;
        
        // Sample points along the route (every 3km for better coverage)
        const samplePoints = [];
        const sampleInterval = 3000; // 3km in meters
        
        for (let distance = 0; distance < totalDistance; distance += sampleInterval) {
            const distanceRatio = distance / totalDistance;
            const pointIndex = Math.floor(distanceRatio * routePath.length);
            if (pointIndex < routePath.length) {
                samplePoints.push({
                    location: routePath[pointIndex],
                    distanceFromStart: distance / 1000 // Convert to km
                });
            }
        }

        // Search for restaurants at each sample point
        for (const pointData of samplePoints) {
            try {
                const nearbyRestaurants = await this.searchNearbyRestaurants(pointData.location);
                // Filter restaurants with 1000+ ratings and add distance info
                const qualifiedRestaurants = nearbyRestaurants
                    .filter(restaurant => restaurant.user_ratings_total >= 1000)
                    .map(restaurant => ({
                        ...restaurant,
                        distanceFromStart: pointData.distanceFromStart
                    }));
                allRestaurants.push(...qualifiedRestaurants);
            } catch (error) {
                console.warn('Error searching restaurants near point:', error);
            }
        }

        // Remove duplicates
        const uniqueRestaurants = this.removeDuplicateRestaurants(allRestaurants);
        
        // Apply smart filtering for context-aware selection
        return this.smartFilterRestaurants(uniqueRestaurants, totalDistance / 1000);
    }

    smartFilterRestaurants(restaurants, totalDistanceKm) {
        if (restaurants.length === 0) return [];
        
        // Sort by distance from start
        const sortedRestaurants = restaurants.sort((a, b) => a.distanceFromStart - b.distanceFromStart);
        
        // Context-aware filtering
        const filteredRestaurants = [];
        const minDistanceBetween = 5; // Minimum 5km between restaurants
        const avoidLastKm = 10; // Avoid restaurants in last 10km of journey
        
        for (let i = 0; i < sortedRestaurants.length; i++) {
            const restaurant = sortedRestaurants[i];
            
            // Skip if too close to destination
            if (restaurant.distanceFromStart > totalDistanceKm - avoidLastKm) {
                continue;
            }
            
            // Check if this restaurant is far enough from the last selected one
            const lastSelected = filteredRestaurants[filteredRestaurants.length - 1];
            if (!lastSelected || 
                (restaurant.distanceFromStart - lastSelected.distanceFromStart) >= minDistanceBetween) {
                
                // Check for nearby restaurants and pick the best one
                const nearbyRestaurants = sortedRestaurants.filter(r => 
                    Math.abs(r.distanceFromStart - restaurant.distanceFromStart) <= 2 && // Within 2km
                    r.placeId !== restaurant.placeId
                );
                
                if (nearbyRestaurants.length > 0) {
                    // Include the current restaurant in comparison
                    const candidates = [restaurant, ...nearbyRestaurants];
                    // Sort by rating (descending) and pick the best one
                    const bestRestaurant = candidates.sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
                    
                    // Only add if we haven't already added this restaurant
                    if (!filteredRestaurants.some(r => r.placeId === bestRestaurant.placeId)) {
                        filteredRestaurants.push(bestRestaurant);
                    }
                } else {
                    // No nearby restaurants, add this one
                    filteredRestaurants.push(restaurant);
                }
            }
        }
        
        return filteredRestaurants;
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
                        geometry: place.geometry,
                        user_ratings_total: place.user_ratings_total || 0
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

        // Add restaurant markers to map
        this.addRestaurantMarkers(restaurants);

        // Display restaurants
        this.displayRestaurants(restaurants);
    }

    addRestaurantMarkers(restaurants) {
        if (!this.map || !restaurants.length) return;

        // Add markers for each restaurant with numbers
        restaurants.forEach((restaurant, index) => {
            if (restaurant.geometry && restaurant.geometry.location) {
                const number = index + 1;
                
                // Create numbered marker icon
                const restaurantIcon = {
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                        <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="20" cy="20" r="18" fill="#FF6B6B" stroke="#fff" stroke-width="3"/>
                            <text x="20" y="26" text-anchor="middle" fill="white" font-size="16" font-weight="bold">${number}</text>
                        </svg>
                    `),
                    scaledSize: new google.maps.Size(40, 40),
                    anchor: new google.maps.Point(20, 20)
                };

                const marker = new google.maps.Marker({
                    position: restaurant.geometry.location,
                    map: this.map,
                    icon: restaurantIcon,
                    title: `${number}. ${restaurant.name}`,
                    animation: google.maps.Animation.DROP
                });

                // Create info window for each restaurant
                const infoWindow = new google.maps.InfoWindow({
                    content: `
                        <div style="padding: 10px; max-width: 250px;">
                            <h3 style="margin: 0 0 8px 0; color: #333;">${number}. ${restaurant.name}</h3>
                            <p style="margin: 0 0 5px 0; color: #666;">
                                <strong>Rating:</strong> ${restaurant.rating ? restaurant.rating.toFixed(1) : 'N/A'} ⭐ (${restaurant.user_ratings_total || 0} reviews)
                            </p>
                            <p style="margin: 0 0 5px 0; color: #666;">
                                <strong>Distance:</strong> ${restaurant.distanceFromStart.toFixed(1)}km from start
                            </p>
                            <p style="margin: 0 0 5px 0; color: #666;">
                                <strong>Location:</strong> ${this.getLocalityAndCity(restaurant.address)}
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
            restaurantsList.innerHTML = '<div class="no-restaurants">No restaurants with 1000+ ratings found along this route.</div>';
            return;
        }

        // Display restaurants as a free-flowing numbered list
        const restaurantsHTML = restaurants.map((restaurant, index) => {
            const number = index + 1;
            const rating = restaurant.rating ? restaurant.rating.toFixed(1) : 'N/A';
            const stars = this.generateStars(restaurant.rating || 0);
            const priceLevel = this.getPriceLevel(restaurant.priceLevel);
            const types = restaurant.types ? restaurant.types.slice(0, 2) : [];

            return `
                <div class="restaurant-item" data-number="${number}">
                    <div class="restaurant-number">${number}</div>
                    <div class="restaurant-content">
                        <div class="restaurant-name">${restaurant.name}</div>
                        <div class="restaurant-rating">
                            <span class="stars">${stars}</span>
                            <span class="rating-text">${rating} ⭐ (${restaurant.user_ratings_total || 0} reviews)</span>
                        </div>
                        <div class="restaurant-location">${this.getLocalityAndCity(restaurant.address)}</div>
                        <div class="restaurant-distance">${restaurant.distanceFromStart.toFixed(1)}km from start</div>
                        <div class="restaurant-price">${priceLevel}</div>
                        <div class="restaurant-types">
                            ${types.map(type => `<span class="type-tag">${type.replace(/_/g, ' ')}</span>`).join('')}
                        </div>
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

    getLocalityAndCity(address) {
        if (!address) return 'Location not available';
        
        // Split address by comma and take the last two parts (usually city, state/country)
        const parts = address.split(',').map(part => part.trim());
        if (parts.length >= 2) {
            return parts.slice(-2).join(', ');
        }
        return address;
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
