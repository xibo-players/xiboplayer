# User Guides

**Operating a Xibo Player?** These guides cover day-to-day player operation and common tasks.

## 📖 Available Guides

### [Offline Kiosk Mode](OFFLINE_KIOSK_MODE.md)
Run the player without internet connectivity. Perfect for isolated kiosks and offline deployments.

**Topics**:
- Pre-downloading all content
- Disabling CMS sync
- Infinite loop playback
- Troubleshooting offline issues

### Campaigns and Scheduling
See: [packages/schedule/docs/](../../packages/schedule/docs/)

**Topics**:
- Campaign priority
- Dayparting schedules
- Interrupt campaigns
- Default layouts

### Layout Transitions
See: [packages/renderer/docs/](../../packages/renderer/docs/)

**Topics**:
- Transition effects
- Custom transitions
- Performance considerations

## 🎯 Common Tasks

### Change Display Settings

1. Access player configuration (depends on platform):
   - **PWA**: Edit `public/config.json`
   - **Electron**: Settings in system tray
   - **Android**: App settings
2. Restart player to apply changes

### Update CMS Connection

1. Locate configuration file
2. Update `cmsUrl` and `cmsKey`
3. Restart player
4. Verify connection in CMS (Displays → Your Display → Status)

### Clear Cache

**When to clear cache**:
- Display showing old content
- Layouts not updating
- Storage full warnings

**How to clear**:

**PWA**:
```
1. Open browser DevTools (F12)
2. Application → Clear Storage
3. Click "Clear site data"
```

**Electron**:
```
1. System tray → Settings
2. Storage → Clear Cache
```

**Android**:
```
Settings → Apps → Xibo Player → Storage → Clear Cache
```

### Restart Player

**PWA**: Refresh browser (Ctrl+R or Cmd+R)

**Electron**: System tray → Restart

**Android**: Close and reopen app

## 🐛 Troubleshooting

### Player Not Connecting to CMS

**Symptoms**:
- "Connection Error" messages
- Display shows "offline" in CMS

**Solutions**:
1. Check network connectivity
2. Verify CMS URL is correct (https://)
3. Check firewall isn't blocking ports
4. Verify CMS is accessible from player's network

### Content Not Updating

**Symptoms**:
- Old layouts still showing
- New content not appearing

**Solutions**:
1. Check CMS schedule (is new content scheduled?)
2. Verify display groups are correct
3. Wait for next collection interval (usually 5 min)
4. Force immediate collection (Electron tray → Sync Now)
5. Clear cache and restart

### Video Not Playing

**Symptoms**:
- Black screen where video should be
- Video placeholder visible but no playback

**Solutions**:
1. Verify video format (MP4 H.264 recommended)
2. Check browser console for codec errors
3. Verify file downloaded (check Storage in DevTools)
4. Try different video file

### Memory Issues

**Symptoms**:
- Browser becomes slow
- Tab crashes
- "Out of memory" errors

**Solutions**:
1. Reduce media file sizes
2. Limit concurrent video regions
3. Enable hardware acceleration
4. Restart player daily (scheduled task)
5. See [Performance Guide](../technical-reference/PERFORMANCE_TESTING.md)

## 📊 Monitoring

### Check Player Health

**PWA**:
```
1. Open DevTools Console (F12)
2. Look for "[HealthCheck]" logs
3. Verify no red errors
```

**Electron**:
```
System tray → Status → Health Check
```

### View Resource Usage

**Browser (F12)**:
- **Performance**: Memory timeline
- **Network**: Download activity
- **Application**: Storage usage

### Logs

**PWA**: Browser Console (F12)

**Electron**:
- Logs directory: `~/.xibo-player/logs/` (Linux)
- Windows: `%APPDATA%\xibo-player\logs\`

**Android**: Logcat filtered to "XiboPlayer"

## 🔔 Best Practices

### Regular Maintenance

- **Daily**: Check player is showing correct content
- **Weekly**: Review logs for errors
- **Monthly**: Clear cache, update player software
- **Quarterly**: Review and optimize content schedules

### Content Guidelines

- **Videos**: MP4 H.264, max 1920x1080, <100MB per file
- **Images**: JPEG/PNG, max 4K resolution, <10MB per file
- **Total Content**: Keep under 2GB for reliable caching

### Network Requirements

- **Minimum**: 5 Mbps download (for HD video)
- **Recommended**: 10+ Mbps for smooth operation
- **Offline**: No network required after initial sync

## 📚 Related Documentation

- **Getting Started**: [Installation guides](../getting-started/)
- **Technical**: [Architecture details](../technical-reference/)
- **Development**: [Contributing guide](../developer-guides/)

## 🆘 Getting Help

- **Issues**: https://github.com/xibo/xibo-players/issues
- **Community**: https://community.xibo.org.uk/
- **Commercial Support**: https://xibo.org.uk/support/

---

**Last Updated**: 2026-02-10
