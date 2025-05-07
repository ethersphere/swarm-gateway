export function getNotFoundPage() {
    return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Not Found | Swarm Gateway</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            body {
                height: 100vh;
                background: rgb(12, 17, 21);
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                color: #f8f9fa;
                padding: 20px;
            }

            .container {
                background: #1e232880;
                border-radius: 12px;
                padding: 40px;
                text-align: center;
            }

            h1 {
                font-size: 6.5rem;
                color: #6c6c6c;
            }

            h2 {
                font-size: 2.5rem;
                margin-bottom: 60px;
            }

            ul {
                text-align: left;
                margin: 0 auto;
                display: inline-block;
                font-size: 1.1rem;
            }

            li {
                margin-bottom: 10px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>404</h1>
            <h2>Not Found</h2>
            <ul>
                <li>This content hash could be invalid.</li>
                <li>The data may still be propagating across the network.</li>
                <li>The postage stamp may have expired and the content is now deleted.</li>
            </ul>
        </div>
    </body>
</html>`
}
