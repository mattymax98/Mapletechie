import pg from "pg";
import { requireRailwayUrl } from "./railwayMigrationGuard";
import { classifyTaxonomyTag, type TaxonomyAction } from "./tagTaxonomyPolicy";
import { normalizeSemanticTag } from "./tagSemanticAuditRules";

const { Client } = pg;

type PostRow = {
  id: number;
  slug: string;
  title: string;
  tags: string[];
  seo_keywords: string[];
  category_name: string | null;
};

type TagInfo = {
  tag: string;
  count: number;
  keywordNormalized: number;
  postIds: Set<number>;
  categories: Map<string, number>;
  examples: Array<{id:number; slug:string; title:string; category:string|null}>;
};

function tagPath(tag: string): string {
  return "/tag/" + encodeURIComponent(normalizeSemanticTag(tag));
}

async function main() {
  const client = new Client({ connectionString: requireRailwayUrl(process.env) });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const posts=(await client.query<PostRow>(`
      SELECT p.id, p.slug, p.title, p.tags, p.seo_keywords, c.name AS category_name
      FROM posts p
      LEFT JOIN categories c ON c.id=p.category_id
      WHERE p.status='published'
      ORDER BY p.id
    `)).rows;
    const categoryRows=(await client.query<{post_id:number; slug:string}>(`
      SELECT pc.post_id, c.slug
      FROM post_categories pc
      INNER JOIN categories c ON c.id=pc.category_id
      INNER JOIN posts p ON p.id=pc.post_id
      WHERE p.status='published'
    `)).rows;
    await client.query("COMMIT");

    const postById=new Map(posts.map((post)=>[post.id,post]));

    const categoriesByPost=new Map<number,Set<string>>();
    for(const row of categoryRows){
      const set=categoriesByPost.get(row.post_id)??new Set<string>();
      set.add(row.slug);
      categoriesByPost.set(row.post_id,set);
    }

    const map=new Map<string,TagInfo>();
    for(const post of posts){
      const normalizedKeywords=new Set((post.seo_keywords??[]).map(normalizeSemanticTag));
      for(const tag of post.tags??[]){
        let info=map.get(tag);
        if(!info){
          info={tag,count:0,keywordNormalized:0,postIds:new Set(),categories:new Map(),examples:[]};
          map.set(tag,info);
        }
        if(info.postIds.has(post.id)) continue;
        info.postIds.add(post.id);
        info.count++;
        if(normalizedKeywords.has(normalizeSemanticTag(tag))) info.keywordNormalized++;
        const cat=post.category_name??"(none)";
        info.categories.set(cat,(info.categories.get(cat)??0)+1);
        if(info.examples.length<4) info.examples.push({id:post.id,slug:post.slug,title:post.title,category:post.category_name});
      }
    }

    const decisions=new Map<string,ReturnType<typeof classifyTaxonomyTag>>();
    const rows=[...map.values()].map((info)=>{
      const decision=classifyTaxonomyTag(info);
      decisions.set(info.tag,decision);
      const redirect =
        decision.action==="MERGE" ? tagPath(decision.destination!) :
        decision.action==="RETIRE_CATEGORY" ? decision.destination :
        decision.action==="RETIRE" ? "410 Gone" :
        tagPath(info.tag);
      const destinationCategorySlug =
        decision.action==="RETIRE_CATEGORY" && decision.destination?.startsWith("/category/")
          ? decision.destination.slice("/category/".length)
          : null;
      const missingCategoryPostIds = destinationCategorySlug
        ? [...info.postIds].filter((postId)=>!(categoriesByPost.get(postId)?.has(destinationCategorySlug)))
        : [];
      const missingCategoryPosts=missingCategoryPostIds.map((postId)=>{
        const post=postById.get(postId)!;
        return { id:post.id, slug:post.slug, title:post.title, currentPrimaryCategory:post.category_name };
      });
      return {
        tag:info.tag,
        publishedCount:info.count,
        action:decision.action,
        destination:decision.destination??null,
        redirect,
        reason:decision.reason,
        keywordOverlap:info.keywordNormalized,
        categoryBackfillsNeeded:missingCategoryPostIds.length,
        categoryBackfillPosts:missingCategoryPosts,
        categories:[...info.categories.entries()].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})),
        examples:info.examples,
      };
    }).sort((a,b)=>{
      const order:Record<TaxonomyAction,number>={RETIRE_CATEGORY:0,MERGE:1,RETIRE:2,KEEP:3};
      return order[a.action]-order[b.action] || b.publishedCount-a.publishedCount || a.tag.localeCompare(b.tag,"en-CA");
    });

    const simulatedCounts=new Map<string,number>();
    const affectedPosts:any[]=[];
    let removedAssignments=0;
    let mergedAssignments=0;
    for(const post of posts){
      const after:string[]=[];
      const seen=new Set<string>();
      for(const tag of post.tags??[]){
        const d=decisions.get(tag)!;
        if(d.action==="RETIRE" || d.action==="RETIRE_CATEGORY"){
          removedAssignments++;
          continue;
        }
        const next=d.action==="MERGE" ? d.destination! : tag;
        const key=normalizeSemanticTag(next);
        if(seen.has(key)) continue;
        seen.add(key);
        after.push(next);
        if(d.action==="MERGE") mergedAssignments++;
      }
      const before=post.tags??[];
      if(before.length!==after.length || before.some((t,i)=>t!==after[i])){
        affectedPosts.push({id:post.id,slug:post.slug,title:post.title,before,after});
      }
      for(const key of new Set(after.map(normalizeSemanticTag))) simulatedCounts.set(key,(simulatedCounts.get(key)??0)+1);
    }

    const actionCounts=rows.reduce((acc,row)=>{
      acc[row.action]=(acc[row.action]??0)+1;
      return acc;
    },{} as Record<string,number>);

    const report={
      mode:"PASS_2B_CLASSIFICATION_DRY_RUN",
      generatedAt:new Date().toISOString(),
      summary:{
        publishedPosts:posts.length,
        currentDistinctTags:rows.length,
        keep:actionCounts.KEEP??0,
        merge:actionCounts.MERGE??0,
        retireToCategory:actionCounts.RETIRE_CATEGORY??0,
        retire:actionCounts.RETIRE??0,
        resultingDistinctTags:simulatedCounts.size,
        currentSingletons:rows.filter((x)=>x.publishedCount===1).length,
        resultingSingletons:[...simulatedCounts.values()].filter((n)=>n===1).length,
        currentDoubletons:rows.filter((x)=>x.publishedCount===2).length,
        resultingDoubletons:[...simulatedCounts.values()].filter((n)=>n===2).length,
        currentSitemapEligible:rows.filter((x)=>x.publishedCount>=3).length,
        resultingSitemapEligible:[...simulatedCounts.values()].filter((n)=>n>=3).length,
        affectedPosts:affectedPosts.length,
        removedAssignments,
        mergedAssignments,
        categoryMembershipBackfillsNeeded:rows
          .filter((x)=>x.action==="RETIRE_CATEGORY")
          .reduce((sum,x)=>sum+x.categoryBackfillsNeeded,0),
      },
      classifications:rows,
      affectedPosts,
    };
    console.log(JSON.stringify(report,null,2));
  } finally {
    await client.end();
  }
}
main().catch((error)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
