(() => {
    const apiBase = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/$/, '') || '';
    const tokenInput = document.getElementById('admin-token');
    const authStatus = document.getElementById('admin-auth-status');
    const dashboard = document.getElementById('admin-dashboard');
    const rows = document.getElementById('license-rows');
    const dataStatus = document.getElementById('admin-data-status');
    let adminToken = '';

    const endpoint = path => `${apiBase}${path}`;
    const setMessage = (message, tone = '') => {
        authStatus.textContent = message;
        authStatus.className = `admin-message ${tone}`.trim();
    };

    const formatDate = value => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
    };

    const loadDashboard = async () => {
        if (!adminToken) return;
        dataStatus.textContent = 'Loading';
        try {
            const response = await fetch(endpoint('/api/admin/overview'), {
                headers: { Authorization: `Bearer ${adminToken}` },
                cache: 'no-store'
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load admin data.');

            document.getElementById('stat-total').textContent = data.stats?.total ?? '0';
            document.getElementById('stat-active').textContent = data.stats?.active ?? '0';
            document.getElementById('stat-expired').textContent = data.stats?.expired ?? '0';
            document.getElementById('stat-revoked').textContent = data.stats?.revoked ?? '0';

            rows.replaceChildren();
            const licenses = Array.isArray(data.licenses) ? data.licenses : [];
            if (!licenses.length) {
                const row = document.createElement('tr');
                const cell = document.createElement('td');
                cell.colSpan = 6;
                cell.className = 'empty-table';
                cell.textContent = 'No licenses have been issued yet.';
                row.appendChild(cell);
                rows.appendChild(row);
            } else {
                licenses.forEach(license => {
                    const row = document.createElement('tr');
                    const values = [license.id, license.product_id, license.status, formatDate(license.expires_at), formatDate(license.created_at)];
                    values.forEach(value => {
                        const cell = document.createElement('td');
                        cell.textContent = String(value ?? '—');
                        row.appendChild(cell);
                    });

                    const actionCell = document.createElement('td');
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'btn btn-danger btn-small';
                    button.textContent = license.status === 'revoked' ? 'Revoked' : 'Revoke';
                    button.disabled = license.status === 'revoked';
                    button.addEventListener('click', () => revokeLicense(license.id));
                    actionCell.appendChild(button);
                    row.appendChild(actionCell);
                    rows.appendChild(row);
                });
            }

            dashboard.hidden = false;
            dataStatus.textContent = `Updated ${new Date().toLocaleTimeString()}`;
            setMessage('Authenticated.', 'success');
        } catch (error) {
            dataStatus.textContent = 'Error';
            setMessage(error instanceof Error ? error.message : 'Unable to load admin data.', 'error');
        }
    };

    const revokeLicense = async licenseId => {
        if (!adminToken) return;
        if (!window.confirm(`Revoke license #${licenseId}? This action cannot be undone.`)) return;

        try {
            const response = await fetch(endpoint('/api/admin/licenses/revoke'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                },
                body: JSON.stringify({ licenseId }),
                cache: 'no-store'
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.error || 'Unable to revoke license.');
            await loadDashboard();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Unable to revoke license.', 'error');
        }
    };

    document.getElementById('load-dashboard')?.addEventListener('click', async () => {
        const value = tokenInput?.value.trim() || '';
        if (value.length < 32) {
            setMessage('Enter the configured admin key.', 'error');
            return;
        }
        adminToken = value;
        await loadDashboard();
    });

    document.getElementById('refresh-dashboard')?.addEventListener('click', loadDashboard);
})();
