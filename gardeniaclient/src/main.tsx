import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ProjectManagerPage } from './components/ProjectManagerPage'
import './index.css'

function Root() {
    const [route, setRoute] = useState(window.location.hash);

    useEffect(() => {
        const onHashChange = () => setRoute(window.location.hash);
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    // If the URL hash is #/projects, show the project manager
    if (route === '#/projects') {
        return <ProjectManagerPage />;
    }

    // Otherwise show the main workflow app
    return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Root />
    </React.StrictMode>,
)

