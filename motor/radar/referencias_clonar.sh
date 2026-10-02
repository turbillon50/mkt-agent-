cd /root/referencias-mkt
for r in coreyhaines31/marketingskills langchain-ai/paid-media-agent unifapi-agent/agents Dataslayer-AI/Marketing-skills vercel-labs/marketing-team-eve-template SaigonXIII/evc assafelovic/gpt-researcher unclecode/crawl4ai obsei/obsei firecrawl/firegeo google/meridian pymc-labs/pymc-marketing facebookresearch/Ad-Library-API-Script-Repository yiromo/pytrends-modern google/adk-recipes; do
  d=$(echo $r | tr / __)
  [ -d "$d" ] || git clone -q --depth 1 --single-branch https://github.com/$r.git "$d" && echo "ok $r $(du -sh $d | cut -f1)"
done
echo FIN
