#!/bin/bash
# Launch Day Automation Scripts
# Because humans forget things when excited

echo "🚀 SALON AI LAUNCH DAY SCRIPTS 🚀"
echo "================================="

# Function to check system health
check_system_health() {
    echo "⏳ Checking system health..."
    
    # Database check
    if psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; then
        echo "✅ Database: Connected"
    else
        echo "❌ Database: FAILED"
        exit 1
    fi
    
    # Redis check
    if redis-cli ping > /dev/null 2>&1; then
        echo "✅ Redis: Connected"
    else
        echo "❌ Redis: FAILED"
        exit 1
    fi
    
    # API health check
    API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.salonai.com/health)
    if [ $API_STATUS -eq 200 ]; then
        echo "✅ API: Healthy"
    else
        echo "❌ API: FAILED (Status: $API_STATUS)"
        exit 1
    fi
    
    # Payment processor
    STRIPE_STATUS=$(curl -s https://api.stripe.com/v1/charges -u $STRIPE_SECRET_KEY: -d amount=100 -d currency=usd -d source=tok_visa -d description="Launch test" | jq -r '.status')
    if [ "$STRIPE_STATUS" = "succeeded" ]; then
        echo "✅ Stripe: Working"
        # Immediately refund test charge
        curl -s https://api.stripe.com/v1/refunds -u $STRIPE_SECRET_KEY: -d charge=$CHARGE_ID > /dev/null
    else
        echo "❌ Stripe: FAILED"
        exit 1
    fi
    
    echo "✅ All systems operational!"
}

# Function to enable feature flags
enable_features() {
    echo "⏳ Enabling feature flags..."
    
    # Enable core features
    redis-cli set "feature:registration" "true"
    redis-cli set "feature:color_ai" "true"
    redis-cli set "feature:insurance" "true"
    redis-cli set "feature:voice" "true"
    
    # Set launch mode
    redis-cli set "launch:mode" "live"
    redis-cli set "launch:timestamp" $(date +%s)
    
    echo "✅ All features enabled!"
}

# Function to scale infrastructure
scale_for_launch() {
    echo "⏳ Scaling infrastructure..."
    
    # Scale web servers
    kubectl scale deployment web --replicas=10
    
    # Scale API servers
    kubectl scale deployment api --replicas=20
    
    # Scale background workers
    kubectl scale deployment workers --replicas=15
    
    # Increase database connections
    aws rds modify-db-parameter-group \
        --db-parameter-group-name salonai-prod \
        --parameters "ParameterName=max_connections,ParameterValue=500,ApplyMethod=immediate"
    
    echo "✅ Infrastructure scaled!"
}

# Function to start monitoring
start_monitoring() {
    echo "⏳ Starting enhanced monitoring..."
    
    # Start metric collection
    screen -dmS metrics npm run monitor:metrics
    
    # Start error tracking
    screen -dmS errors npm run monitor:errors
    
    # Start performance monitoring
    screen -dmS performance npm run monitor:performance
    
    # Start Reddit monitoring
    screen -dmS reddit python scripts/reddit_monitor.py
    
    echo "✅ Monitoring active!"
}

# Function to notify team
notify_team() {
    echo "⏳ Notifying team..."
    
    # Slack notification
    curl -X POST -H 'Content-type: application/json' \
        --data '{"text":"🚀 LAUNCH SYSTEMS ARE GO! All systems green. T-minus 10 minutes!"}' \
        $SLACK_WEBHOOK_URL
    
    # SMS to key people
    for number in $TEAM_NUMBERS; do
        curl -X POST https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json \
            -u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN \
            -d "From=$TWILIO_FROM" \
            -d "To=$number" \
            -d "Body=🚀 Launch systems green! Be ready in 10 min!"
    done
    
    echo "✅ Team notified!"
}

# Function to create system snapshot
create_snapshot() {
    echo "⏳ Creating pre-launch snapshot..."
    
    # Database snapshot
    SNAPSHOT_ID="launch-day-$(date +%Y%m%d-%H%M%S)"
    aws rds create-db-snapshot \
        --db-instance-identifier salonai-prod \
        --db-snapshot-identifier $SNAPSHOT_ID
    
    # Redis backup
    redis-cli BGSAVE
    
    # Code snapshot
    git tag -a "launch-day-$(date +%Y%m%d)" -m "Launch day snapshot"
    git push origin --tags
    
    echo "✅ Snapshots created!"
}

# Function to run final tests
run_final_tests() {
    echo "⏳ Running final tests..."
    
    # Critical path tests only
    npm run test:critical
    
    if [ $? -eq 0 ]; then
        echo "✅ All critical tests passed!"
    else
        echo "❌ Tests failed! Aborting launch!"
        exit 1
    fi
}

# Main launch sequence
case "$1" in
    "preflight")
        echo "🚁 Running pre-flight checks..."
        check_system_health
        run_final_tests
        create_snapshot
        ;;
        
    "launch")
        echo "🚀 INITIATING LAUNCH SEQUENCE!"
        check_system_health
        scale_for_launch
        enable_features
        start_monitoring
        notify_team
        echo "🎉 LAUNCH COMPLETE! Systems are GO!"
        ;;
        
    "monitor")
        echo "📊 Launch Day Monitoring"
        while true; do
            clear
            echo "SALON AI - LAUNCH DAY METRICS"
            echo "============================="
            echo "Time: $(date)"
            echo ""
            
            # Get metrics from Redis
            echo "Signups: $(redis-cli get metrics:signups:today || echo 0)"
            echo "Active Users: $(redis-cli get metrics:active_users || echo 0)"
            echo "API Calls: $(redis-cli get metrics:api_calls:today || echo 0)"
            echo "Error Rate: $(redis-cli get metrics:error_rate || echo 0)%"
            echo "Avg Response Time: $(redis-cli get metrics:response_time || echo 0)ms"
            echo ""
            echo "Reddit Stats:"
            echo "Upvotes: $(redis-cli get reddit:upvotes || echo 0)"
            echo "Comments: $(redis-cli get reddit:comments || echo 0)"
            echo ""
            echo "Press Ctrl+C to exit"
            
            sleep 10
        done
        ;;
        
    "emergency")
        echo "🚨 EMERGENCY SHUTDOWN!"
        # Disable features
        redis-cli set "feature:registration" "false"
        redis-cli set "launch:mode" "emergency"
        
        # Scale down
        kubectl scale deployment web --replicas=2
        kubectl scale deployment api --replicas=2
        
        # Notify team
        curl -X POST -H 'Content-type: application/json' \
            --data '{"text":"🚨 EMERGENCY: Launch paused. Check systems immediately!"}' \
            $SLACK_WEBHOOK_URL
        ;;
        
    *)
        echo "Usage: $0 {preflight|launch|monitor|emergency}"
        exit 1
        ;;
esac

# Launch day reminders
echo ""
echo "📝 Launch Day Reminders:"
echo "- Stay calm, trust the system"
echo "- Monitor Reddit every 15 min"
echo "- Respond to every comment"
echo "- Screenshot everything"
echo "- Celebrate small wins"
echo "- It's a marathon, not a sprint"
echo ""
echo "You've got this! 🚀"