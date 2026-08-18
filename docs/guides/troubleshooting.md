# Troubleshooting Guide

> **Target audience**: Operators diagnosing issues with Sentinel

This guide covers common problems and their solutions.

---

## Quick Diagnostics

### Check Service Status

```bash
# Are all containers running?
docker compose ps

# Expected output:
# sentinel-api      running (healthy)
# sentinel-web      running
# sentinel-postgres running (healthy)
```

### Check Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f postgres

# Last 100 lines
docker compose logs --tail 100 api
```

### Check Health Endpoints

```bash
# API health
curl http://localhost:3000/health

# MCP proxy health
curl http://localhost:3001/health

# A2A health
curl http://localhost:3002/health
```

---

## Connection Issues

### AI Client Can't Connect

**Symptoms**: "Connection refused" or "Network error" in AI client

**Checklist**:

1. **Is Sentinel running?**
   ```bash
   docker compose ps
   curl http://localhost:3001/health
   ```

2. **Is the URL correct?**
   - MCP proxy: `http://localhost:3001/mcp` (note `/mcp` suffix)
   - Not the API port (3000)

3. **Is the API key valid?**
   - Check in Dashboard > Credentials
   - Ensure no extra whitespace
   - Format: `Bearer <key>` in Authorization header

4. **Firewall blocking?**
   ```bash
   # Check if port is listening
   netstat -tlnp | grep 3001
   # or
   lsof -i :3001
   ```

5. **For remote servers**: Is the port exposed?
   ```bash
   # Check from your machine
   curl http://server-ip:3001/health
   ```

### Database Connection Failed

**Symptoms**: API won't start, "ECONNREFUSED" errors

**Solutions**:

1. **Check PostgreSQL is running**:
   ```bash
   docker compose ps postgres
   docker compose logs postgres
   ```

2. **Test connection**:
   ```bash
   docker compose exec api sh -c 'nc -zv postgres 5432'
   ```

3. **Verify DATABASE_URL**:
   ```bash
   # Should match docker-compose internal network
   # postgresql://sentinel:password@postgres:5432/sentinel
   grep DATABASE_URL .env
   ```

4. **Reset database if corrupted**:
   ```bash
   docker compose down -v  # WARNING: Deletes all data
   docker compose up -d
   pnpm setup
   ```

---

## Authentication Issues

### "Invalid API key"

1. **Regenerate key**: Dashboard > Credentials > Regenerate
2. **Check format**: Must be `Authorization: Bearer <key>` (with space)
3. **Check expiration**: Keys may have expiry dates
4. **Check organization**: Key must match current organization

### "Session expired"

1. **Refresh browser**: Clear cookies, log in again
2. **Check SESSION_SECRET**: If changed, all sessions invalidate
3. **Increase session timeout**: Configure in Admin > Settings

### SSO/OIDC Login Fails

1. **Check callback URL**: Must match OIDC provider config
2. **Verify client credentials**: Client ID and Secret
3. **Check issuer URL**: Must be accessible from Sentinel server
4. **Review OIDC logs**:
   ```bash
   docker compose logs api | grep -i oidc
   ```

---

## Policy Issues

### Tool Being Denied Unexpectedly

1. **Check Activity log**: Admin > Activity shows policy evaluations
2. **Look for DENY policies**: Higher priority DENY overrides ALLOW
3. **Verify matcher pattern**: Exact match required
4. **Check role assignment**: User must have policy's role

**Debug command**:
```bash
# Check what policies would match a tool
docker compose exec api npx tsx scripts/debug-policy.ts \
  --tool "filesystem::read_file" \
  --user "alice@company.com"
```

### DEFER Not Prompting Approval

1. **Check webhook configuration**: Notifications may not be set up
2. **Verify policy matcher**: Must match the tool request
3. **Check user role**: User must be assigned the DEFER policy role
4. **Look in Approvals queue**: Dashboard > Approvals

---

## MCP Server Issues

### MCP Server Won't Start

1. **Check server configuration**: Admin > MCP Servers
2. **Test command manually**:
   ```bash
   # Run the command directly
   npx -y @anthropic/mcp-server-filesystem /tmp
   ```

3. **Check for missing dependencies**:
   ```bash
   docker compose exec api npm list -g
   ```

4. **Review startup logs**:
   ```bash
   docker compose logs api | grep -i "mcp\|server\|spawn"
   ```

### "No tools available"

1. **Is server registered?**: Admin > MCP Servers
2. **Is server connected?**: Green indicator in dashboard
3. **Do you have ALLOW policies?**: Check Admin > Policies
4. **Check your role**: Must have access via policy

### Tool Timeout

1. **Increase timeout**: Server config > Advanced > Timeout
2. **Check server performance**: May be overloaded
3. **Monitor resources**:
   ```bash
   docker stats
   ```

---

## Performance Issues

### Slow Response Times

1. **Check resource usage**:
   ```bash
   docker stats
   ```

2. **Database queries slow?**:
   ```bash
   docker compose exec postgres psql -U sentinel -c "SELECT * FROM pg_stat_activity"
   ```

3. **Add database indexes**: Check for missing indexes on common queries

4. **Scale horizontally**: Add more API instances behind load balancer

### High Memory Usage

1. **Check for memory leaks**:
   ```bash
   docker stats --no-stream
   ```

2. **Restart containers**:
   ```bash
   docker compose restart api
   ```

3. **Increase container limits** (docker-compose.prod.yml):
   ```yaml
   deploy:
     resources:
       limits:
         memory: 2G
   ```

### MCP Sessions Accumulating

1. **Check session count**:
   ```bash
   curl http://localhost:3001/health
   # Shows active session count
   ```

2. **Sessions may not be cleaning up**: Check for stale connections
3. **Restart MCP proxy**: `docker compose restart api`

---

## TLS/HTTPS Issues

### Certificate Errors

1. **Self-signed certs**: Browser will warn, add exception
2. **Let's Encrypt failed**: Check port 80 is accessible from internet
3. **Corporate CA**: Mount certificates correctly:
   ```bash
   ls -la certs/
   # Should show cert.pem and key.pem
   ```

### Caddy Not Getting Certificates

1. **Check Caddy logs**:
   ```bash
   docker compose logs caddy
   ```

2. **Verify domain resolves**:
   ```bash
   nslookup $DOMAIN
   ```

3. **Check port 80/443 accessible**:
   ```bash
   curl -I http://$DOMAIN
   ```

### Mixed Content Errors

1. **All URLs must use HTTPS**: Check FRONTEND_URL and API_URL in .env
2. **Update environment**:
   ```bash
   FRONTEND_URL=https://sentinel.example.com
   API_URL=https://sentinel.example.com/api
   ```

---

## Data Issues

### Audit Logs Missing

1. **Check audit is enabled**: Should be on by default
2. **Query database directly**:
   ```bash
   docker compose exec postgres psql -U sentinel -c \
     "SELECT COUNT(*) FROM \"AuditLogEntry\""
   ```

3. **Check disk space**: Logs may fail if disk full

### Credentials Not Decrypting

1. **ENCRYPTION_KEY changed?**: If key changed, old data can't decrypt
2. **Check key format**: Must be 64-character hex string
3. **Verify key**:
   ```bash
   echo $ENCRYPTION_KEY | wc -c
   # Should output 65 (64 chars + newline)
   ```

### Database Migration Failed

1. **Check migration status**:
   ```bash
   docker compose exec api npx prisma migrate status
   ```

2. **Retry migration**:
   ```bash
   docker compose exec api npx prisma db push
   ```

3. **Reset if necessary** (WARNING: data loss):
   ```bash
   docker compose exec api npx prisma migrate reset
   ```

---

## Getting Help

### Collect Diagnostics

```bash
# Create diagnostic bundle
mkdir -p /tmp/sentinel-diagnostics
docker compose ps > /tmp/sentinel-diagnostics/containers.txt
docker compose logs > /tmp/sentinel-diagnostics/logs.txt
docker stats --no-stream > /tmp/sentinel-diagnostics/stats.txt
cat .env | grep -v KEY | grep -v SECRET > /tmp/sentinel-diagnostics/env-safe.txt
```

### Log Locations

| Log | Location |
|-----|----------|
| API | `docker compose logs api` |
| PostgreSQL | `docker compose logs postgres` |
| Caddy/Traefik | `docker compose logs caddy` |
| All combined | `docker compose logs` |

### Support Channels

- GitHub Issues: Report bugs and feature requests
- Documentation: Check docs/ directory
- Activity Logs: Dashboard > Activity for request details
