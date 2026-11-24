export function createRouteMap(canvas) {
    const ctx = canvas.getContext('2d');
    let route = [];

    function grid(width, height) {
        ctx.fillStyle = '#f0f5f1';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#dce7e0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = width % 24 / 2; x < width; x += 24) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }
        for (let y = height % 24 / 2; y < height; y += 24) {
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();
    }

    function marker([x, y], color, radius) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    function draw() {
        const { width, height } = canvas.getBoundingClientRect();
        const pixels = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * pixels);
        canvas.height = Math.round(height * pixels);
        ctx.setTransform(pixels, 0, 0, pixels, 0, 0);
        grid(width, height);
        if (!route.length) return;

        const longitudes = route.map(([lon]) => lon);
        const latitudes = route.map(([, lat]) => lat);
        const longitudeMin = Math.min(...longitudes);
        const longitudeMax = Math.max(...longitudes);
        const latitudeMin = Math.min(...latitudes);
        const latitudeMax = Math.max(...latitudes);
        const meanLat = (latitudeMin + latitudeMax) / 2;
        const cosLat = Math.cos(meanLat * Math.PI / 180);
        const scale = Math.min(
            (width - 78) / Math.max((longitudeMax - longitudeMin) * cosLat, 0.001),
            (height - 114) / Math.max(latitudeMax - latitudeMin, 0.001),
        );
        const meanLon = (longitudeMin + longitudeMax) / 2;
        const points = route.map(([lon, lat]) => [
            width / 2 + (lon - meanLon) * cosLat * scale,
            height / 2 - 12 - (lat - meanLat) * scale,
        ]);

        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 11;
        ctx.stroke();
        ctx.strokeStyle = '#00705a';
        ctx.lineWidth = 5;
        ctx.stroke();
        marker(points[0], '#597b89', 5);
        marker(points.at(-1), '#00705a', 8);
    }

    new ResizeObserver(draw).observe(canvas);
    return {
        setRoute(coordinates, posto) {
            route = coordinates;
            canvas.setAttribute('aria-label', 'Trajeto simplificado da origem até ' + posto);
            draw();
        },
    };
}
