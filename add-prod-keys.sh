#!/bin/bash

# Pull down production .env
npx dotenv-vault pull production

# Add the variables to Wrangler in bulk
while read line || [[ -n "$line" ]]; do
  if [[ $line != \#* ]]; then
    key=$(echo $line | cut -d '=' -f 1)
    value=$(echo $line | cut -d '=' -f 2 | sed 's/^"\(.*\)"$/\1/')
    echo "$value" | wrangler secret put "$key"
  fi
done < .env.production