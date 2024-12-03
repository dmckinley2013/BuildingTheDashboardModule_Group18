import React, {useState, useEffect, useRef} from 'react';
import './Dashboard.css';
import Button from '@mui/material/Button';

// Create MetricCard component
const MetricCard = ({title, value}) => (
    <div className="metric-card">
        <h4>{title}</h4>
        <p>{value}</p>
    </div>
);
const Dashboard = () => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isConnected, setIsConnected] = useState(false);
    const socket = useRef(null);

    const [expandedJobIds, setExpandedJobIds] = useState([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [selectedContentType, setSelectedContentType] = useState('All');

    const [showAnalytics, setShowAnalytics] = useState(false);

    const [performanceStats, setPerformanceStats] = useState({
        averageResponseTime: 0,
        cpuUtilization: 0,
        memoryUsage: 0,
        currentLoad: 0,
        uptime: 0,
        networkStats: {
            bytesSent: 0,
            bytesReceived: 0,
            activeConnections: 0,
            messageRate: 0
        }
    });

    const [fileStats, setFileStats] = useState({
        totalFilesProcessed: messages.length,
        fileTypeDistribution: {
            Document: messages.filter(m => m.content_type === 'Document').length,
            Image: messages.filter(m => m.content_type === 'Image' || m.content_type === 'Picture').length,
            Audio: messages.filter(m => m.content_type === 'Audio').length
        }
    });

    const [systemHealth, setSystemHealth] = useState({
        activeConnections: isConnected ? 1 : 0,
        queueDepth: messages.filter(m => m.status === 'Queued').length,
        memoryUsage: (messages.length * 1024) / (1024 * 1024), // Rough estimate in MB
        successRate: messages.filter(m => m.status === 'Processed').length / messages.length * 100 || 100
    });

    const requestAnalytics = () => {
        if (socket.current?.readyState === WebSocket.OPEN) {
            socket.current.send(JSON.stringify({type: 'getAnalytics'}));
        }
    };

    const handleAnalyticsClick = (event) => {
        // Log the event object
        console.log("Button clicked:", event);

        // Log socket state before sending
        console.log("Socket state before:", {
            readyState: socket.current?.readyState,
            isConnected: isConnected
        });

        if (socket.current?.readyState === WebSocket.OPEN) {
            const analyticsRequest = {type: 'getAnalytics'};
            console.log("Sending request:", analyticsRequest);
            socket.current.send(JSON.stringify(analyticsRequest));
        }

        // Log state changes
        console.log("Current analytics state:", showAnalytics);
        setShowAnalytics(!showAnalytics);
        console.log("New analytics state:", !showAnalytics);
    };


    useEffect(() => {
        if (showAnalytics) {
            requestAnalytics();
            const interval = setInterval(requestAnalytics, 5000);
            return () => clearInterval(interval);
        }
    }, [showAnalytics]);

    // Helper function to truncate Content IDs
    const truncateId = (id) => {
        if (!id) return '';
        return id.length > 10 ? `...${id.slice(-10)}` : id;
    };

    const normalizeContentType = (type) => {
        return type === 'Picture' ? 'Image' : type;
    };

    const groupedMessages = messages.reduce((acc, msg) => {
        const jobId = msg.job_id;
        if (!acc[jobId]) {
            acc[jobId] = [];
        }
        acc[jobId].push(msg);
        return acc;
    }, {});

    // Sort jobs by the latest timestamp in their content
    const sortedGroupedMessages = Object.entries(groupedMessages).sort((a, b) => {
        const getLastTimestamp = (msgs) => {
            return Math.max(...msgs.map(msg => new Date(msg.time).getTime() || 0));
        };
        return getLastTimestamp(b[1]) - getLastTimestamp(a[1]);
    });

    // Filter messages based on search term and content type
    const filteredJobs = sortedGroupedMessages.filter(([jobId, msgs]) => {
        const matchesSearch = jobId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            msgs.some(msg => Object.values(msg).some(value =>
                value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
            ));

        const matchesContentType = selectedContentType === 'All' ||
            msgs.some(msg => normalizeContentType(msg.content_type) === selectedContentType);

        return matchesSearch && matchesContentType;
    });

    // Pagination calculations based on job_id
    const indexOfLastJob = currentPage * itemsPerPage;
    const indexOfFirstJob = indexOfLastJob - itemsPerPage;
    const currentJobs = filteredJobs.slice(indexOfFirstJob, indexOfLastJob);
    const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedContentType, itemsPerPage]);

    useEffect(() => {
        const connectWebSocket = () => {
            socket.current = new WebSocket('ws://localhost:5001');

            socket.current.onopen = () => {
                console.log('WebSocket connected');
                setIsConnected(true);
            };

            socket.current.onmessage = (event) => {
                const data = JSON.parse(event.data);
                console.log('WebSocket data received:', data);
                if (data.type === 'analytics') {
                    const analyticsData = data.data || {};
                    setPerformanceStats(prevStats => ({
                        ...prevStats,
                        ...analyticsData.performanceStats
                    }));
                } else if (data.type === 'initialMessages') {
                    setMessages(prevMessages => [...data.data]);
                    setLoading(false);
                } else if (data.type === 'newMessage') {
                    setMessages(prevMessages => [data.data, ...prevMessages]);
                }
            };
        };

        connectWebSocket();

        const analyticsInterval = setInterval(() => {
            if (socket.current?.readyState === WebSocket.OPEN) {
                socket.current.send(JSON.stringify({type: 'getAnalytics'}));
            }
        }, 5000);

        return () => {
            clearInterval(analyticsInterval);
            if (socket.current) {
                socket.current.close();
            }
        };
    }, []);
    const toggleExpandJobId = (jobId) => {
        setExpandedJobIds((prevExpanded) =>
            prevExpanded.includes(jobId) ? prevExpanded.filter(id => id !== jobId) : [...prevExpanded, jobId]
        );
    };

    return (
        <div className="dashboard-wrapper">
            <header className="dashboard-header">
                <div className="header-content">
                    <img
                        src="/NETC.jpg"
                        alt="NETC Logo"
                        className="netc-logo"
                    />
                    <div className="header-text">
                        <h1>Message Processing Dashboard</h1>
                        <p className="subtitle">Real-time File Processing Monitor</p>
                    </div>
                    <div className="connection-status">
                        <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
                            {isConnected ? 'Connected' : 'Connecting...'}
                        </div>
                    </div>
                </div>
            </header>

            <main className="dashboard-main">
                <div className="stats-section">
                    <div className="stat-card">
                        <h3>Total Messages</h3>
                        <p className="stat-number">{messages.length}</p>
                    </div>
                    <div className="stat-card">
                        <h3>Documents</h3>
                        <p className="stat-number">
                            {messages.filter(m => m.content_type === 'Document').length}
                        </p>
                    </div>
                    <div className="stat-card">
                        <h3>Images</h3>
                        <p className="stat-number">
                            {messages.filter(m => m.content_type === 'Image' || m.content_type === 'Picture').length}
                        </p>
                    </div>
                    <div className="stat-card">
                        <h3>Audio Files</h3>
                        <p className="stat-number">
                            {messages.filter(m => m.content_type === 'Audio').length}
                        </p>
                    </div>
                </div>

                <div className="table-container">
                    <div className="table-controls">
                        <div className="search-bar">
                            <input
                                type="text"
                                placeholder="Search by Job ID, Content ID, etc..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="search-input"
                            />
                        </div>
                        <div className="filter-controls">
                            <select
                                value={selectedContentType}
                                onChange={(e) => setSelectedContentType(e.target.value)}
                                className="filter-select"
                            >
                                <option value="All">All Types</option>
                                <option value="Document">Document</option>
                                <option value="Image">Image</option>
                                <option value="Audio">Audio</option>
                            </select>
                            <select
                                value={itemsPerPage}
                                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                                className="page-size-select"
                            >
                                <option value={10}>10 Jobs per page</option>
                                <option value={25}>25 Jobs per page</option>
                                <option value={50}>50 Jobs per page</option>
                            </select>
                        </div>
                    </div>

                    <div className="table-wrapper">
                        <table className="dashboard-table">
                            <thead>
                            <tr>
                                <th>Job ID</th>
                                <th>Time</th>
                                <th>Content ID</th>
                                <th>Content Type</th>
                                <th>File Name</th>
                                <th>Status</th>
                                <th>Message</th>
                            </tr>
                            </thead>
                            <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7">
                                        <div className="loading-spinner">
                                            <div className="spinner"></div>
                                            <p>Loading messages...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : currentJobs.length > 0 ? (
                                currentJobs.map(([jobId, msgs]) => (
                                    <React.Fragment key={jobId}>
                                        <tr
                                            className="job-row"
                                            onClick={() => toggleExpandJobId(jobId)}
                                        >
                                            <td>{jobId}</td>
                                            <td colSpan="6" className="expand-cell">
                                                {expandedJobIds.includes(jobId) ? '▼' : '▶'}
                                            </td>
                                        </tr>
                                        {expandedJobIds.includes(jobId) && msgs.map((msg, index) => (
                                            <tr key={`${msg.content_id}-${index}`} className="content-row">
                                                <td></td>
                                                <td>{msg.time}</td>
                                                <td title={msg.content_id} className="id-cell">
                                                    {truncateId(msg.content_id)}
                                                </td>
                                                <td>
                                                        <span
                                                            className={`content-type ${normalizeContentType(msg.content_type).toLowerCase()}`}>
                                                            {normalizeContentType(msg.content_type)}
                                                        </span>
                                                </td>
                                                <td>{msg.file_name}</td>
                                                <td>
                                                        <span className={`status ${msg.status.toLowerCase()}`}>
                                                            {msg.status}
                                                        </span>
                                                </td>
                                                <td>{msg.message}</td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="7">No jobs found</td>
                                </tr>
                            )}
                            </tbody>
                        </table>

                        <div className="pagination">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="page-button"
                            >
                                Previous
                            </button>
                            <span className="page-info">
                                Page {currentPage} of {totalPages || 1}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages || totalPages === 0}
                                className="page-button"
                            >
                                Next
                            </button>
                        </div>
                    </div>

                    <Button
                        variant="contained"
                        onClick={handleAnalyticsClick}
                    >
                        {showAnalytics ? 'Hide Analytics' : 'View Analytics'}
                    </Button>

                    {showAnalytics && (
                        <div className="analytics-panel">
                            <div className="analytics-section">
                                <h3>System Performance</h3>
                                <div className="metrics-grid">
                                    <MetricCard title="CPU Usage" value={`${performanceStats.cpuUtilization}%`}/>
                                    <MetricCard title="Memory Usage" value={`${performanceStats.memoryUsage}%`}/>
                                    <MetricCard title="System Load" value={performanceStats.currentLoad}/>
                                    <MetricCard title="Uptime"
                                                value={`${Math.floor(performanceStats.uptime / 3600)}h ${Math.floor((performanceStats.uptime % 3600) / 60)}m`}/>
                                </div>
                            </div>

                            <div className="analytics-section">
                                <h3>Network Performance</h3>
                                <div className="metrics-grid">
                                    <MetricCard title="Data Sent"
                                                value={`${((performanceStats?.networkStats?.bytesSent || 0) / 1024 / 1024).toFixed(2)} MB`}/>
                                    <MetricCard title="Data Received"
                                                value={`${((performanceStats?.networkStats?.bytesReceived || 0) / 1024 / 1024).toFixed(2)} MB`}/>
                                    <MetricCard title="Active Connections"
                                                value={performanceStats?.networkStats?.activeConnections || 0}/>
                                    <MetricCard title="Messages/sec"
                                                value={(performanceStats?.networkStats?.messageRate || 0).toFixed(2)}/>
                                </div>
                            </div>

                            <div className="analytics-section">
                                <h3>Processing Statistics</h3>
                                <div className="metrics-grid">
                                    <MetricCard title="Total Files" value={fileStats.totalFilesProcessed}/>
                                    <MetricCard title="Success Rate" value={`${systemHealth.successRate.toFixed(1)}%`}/>
                                    <MetricCard title="Queue Depth" value={systemHealth.queueDepth}/>
                                    <MetricCard title="Avg Response Time"
                                                value={`${performanceStats.averageResponseTime.toFixed(0)}ms`}/>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <footer className="dashboard-footer">
                <p>© 2024 NETC. All rights reserved.</p>
            </footer>
        </div>
    );
};

export default Dashboard;
