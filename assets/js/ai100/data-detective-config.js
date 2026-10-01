const fishHeadOutput=`   ID Species  Weight  Length  Height  Width
0   1   Roach    27.0    19.0  6.4752  3.3516
1   2   Perch     5.9     7.5  2.1120  1.4080
2   3   Smelt     6.7     9.3  1.7388  1.0476
3   4   Smelt     7.0    10.1  1.7284  1.1484
4   5   Smelt     7.5    10.0  1.9720  1.1600`;
const fishInfoOutput=`<class 'pandas.core.frame.DataFrame'>
RangeIndex: 159 entries, 0 to 158
Data columns (total 6 columns):
 #   Column   Non-Null Count  Dtype
 0   ID       159 non-null    int64
 1   Species  159 non-null    object
 2   Weight   159 non-null    float64
 3   Length   159 non-null    float64
 4   Height   159 non-null    float64
 5   Width    159 non-null    float64
dtypes: float64(4), int64(1), object(1)`;
const fishDescribeOutput=`             ID     Weight     Length     Height      Width
count  159.0000   159.0000   159.0000   159.0000   159.0000
mean    80.0000   398.4962    26.2472     8.9710     4.4175
std     46.0435   357.7945     9.9964     4.2862     1.6858
min      1.0000     5.9000     7.5000     1.7284     1.0476
25%     40.5000   120.0000    19.0500     5.9448     3.3856
50%     80.0000   273.0000    25.2000     7.7860     4.2485
75%    119.5000   650.0000    32.7000    12.3659     5.5845
max    159.0000  1650.0000    59.0000    18.9570     8.1420`;
function fishInspectionOutput(code){const outputs={head:fishHeadOutput,info:fishInfoOutput,describe:fishDescribeOutput};return [...code.replace(/#[^\r\n]*/g,'').matchAll(/fish\.(head|info|describe)\s*\(/g)].map(match=>outputs[match[1]]).join('\n\n')||'No inspection output was requested.';}
const fishPlotPoints=[[19,27,0],[7.5,5.9,1],[9.3,6.7,2],[10.1,7,2],[10,7.5,2],[10.8,8.7,2],[10.4,9.7,2],[10.7,9.8,2],[11.4,9.8,2],[11.3,9.9,2],[11.3,10,2],[11.5,12.2,2],[12.1,12.2,2],[11.7,13.4,2],[13.2,19.7,2],[13.8,19.9,2],[12.5,32,1],[12.9,40,0],[13.8,40,1],[15,51.5,1],[13.5,55,3],[14.3,60,3],[16.5,69,0],[15.7,70,1],[17.5,78,0],[16.8,78,1],[17.2,80,1],[17.8,85,1],[18.2,85,1],[18.2,87,0],[16.3,90,3],[16.2,100,1],[19.1,110,0],[19,110,1],[20,110,1],[19,115,1],[18.6,120,0],[19.4,120,0],[17.5,120,3],[20,120,1],[20,120,1],[19,125,1],[19.3,130,1],[20,130,1],[20.5,130,1],[20,135,1],[21,140,0],[19,140,3],[20.5,145,0],[19.8,145,3],[20.7,145,1],[22,145,1],[20.4,150,0],[18.4,150,3],[20.5,150,1],[21,150,1],[20.5,160,0],[21.1,160,0],[22,161,0],[22,169,0],[19,170,3],[21.5,170,1],[23.6,180,0],[23,180,1],[22.6,188,1],[23.5,197,1],[22.1,200,0],[21.2,200,3],[30,200,4],[25,218,1],[22,225,1],[23.2,242,5],[25.4,250,1],[25.9,250,1],[25.4,260,1],[25.4,265,1],[23.6,270,6],[24.1,270,6],[25,272,0],[23,273,3],[24,290,5],[24,290,0],[24,300,3],[25.2,300,1],[26.9,300,1],[31.7,300,4],[32.7,300,4],[34.8,300,4],[25.6,306,6],[27.8,320,1],[23.9,340,5],[29.5,340,5],[36,345,4],[26.3,363,5],[27.6,390,5],[29.5,390,0],[26.5,430,5],[35.5,430,4],[26.8,450,5],[27.6,450,5],[40,456,4],[28.4,475,5],[26.8,500,5],[28.5,500,5],[28.7,500,5],[29.1,500,5],[42,500,4],[40,510,4],[30.5,514,1],[28.5,540,6],[40.1,540,4],[32,556,1],[43.2,567,4],[31.3,575,5],[29.4,600,5],[29.4,600,5],[30.9,610,5],[31.5,620,5],[31,650,5],[36.5,650,1],[31.8,680,5],[31.4,685,5],[34,685,1],[34.6,690,1],[30.4,700,5],[30.4,700,5],[31.9,700,5],[34,700,1],[34.5,700,1],[32.7,714,5],[32,720,5],[31.8,725,5],[44.8,770,4],[33.7,800,6],[36.6,820,1],[37.1,820,1],[32.5,840,1],[32.8,850,5],[36.9,850,1],[36.5,900,1],[37,900,1],[35,920,5],[36.2,925,5],[38,950,5],[48.3,950,4],[35,955,5],[37.4,975,5],[33.5,1000,5],[37.3,1000,6],[39.8,1000,1],[40.2,1000,1],[41.1,1000,1],[37,1015,1],[39,1100,1],[40.1,1100,1],[52,1250,4],[56,1550,4],[56,1600,4],[59,1650,4]];
window.ML_LAB_CONFIG={id:'data_detective',title:'Data Detective',description:'Explore fish measurements, create charts, and make evidence-based claims—the groundwork for machine learning.',learn:'How rows, features, labels, distributions, and relationships turn observations into evidence.',do:'Use Python tools to load and inspect Fish.csv with pandas, then visualize distributions, species comparisons, and relationships with Seaborn.',instructorCue:'Pause and explain what the visual shows in your own words before moving on.',chartLabel:'Scatterplot of fish length and weight',metrics:{Rows:'159',Columns:'6',Species:'7',Missing:'0'},
scenes:[
 {kind:'dataset-intro',short:'Fish incoming!',title:'Watch observations become rows',copy:'Each fish represents one observation recorded in a table. We will examine these data before building a machine-learning model in a later lab.',visualTitle:'The great fish data migration',visualText:'Imagine recording each fish’s measurements as a row. The observations in this lab are already saved in Fish.csv, a comma-separated values (CSV) file.',species:['Roach','Perch','Smelt','Parkki','Pike','Bream','Whitefish'],colors:['#4f8a62','#3977a8','#e7792f','#8b6bba','#b44539','#6c8d43','#b88a27']},
 {short:'Meet the data',title:'A row is one observed fish',copy:'The dataset records 159 fish. Each row is an observation; each column records one property.',visualTitle:'Fish.csv · data preview',visualText:'Weight is measured in grams (g); Length, Height, and Width are in centimeters (cm). The index at the left starts at 0 and is added by pandas; ID is a column stored in the file. Neither is a fish measurement.',table:{total:159,columns:[{name:'ID',type:'integer'},{name:'Species',type:'text'},{name:'Weight',type:'number'},{name:'Length',type:'number'},{name:'Height',type:'number'},{name:'Width',type:'number'}],rows:[[1,'Roach',27,19,6.4752,3.3516],[2,'Perch',5.9,7.5,2.112,1.408],[3,'Smelt',6.7,9.3,1.7388,1.0476],[4,'Smelt',7,10.1,1.7284,1.1484],[5,'Smelt',7.5,10,1.972,1.16],[6,'Smelt',8.7,10.8,1.9782,1.2852]]},definition:{term:'Observation',text:'One case or example represented by a row.'},cue:'The ID identifies the row, but it is not a measurement that describes the fish.'},
 {kind:'features-target',short:'Features & target',title:'Choose features based on the question',copy:'Looking ahead to a later lab: “Can measurements help us estimate a fish’s weight?” For that question, Length, Height, and Width could be input features (X), and Weight would be the target (y). Here, we only examine the data; we do not train a model.',definition:{term:'Feature',text:'An input measurement used to describe an example and help estimate the target.'},cue:'Read the row from left to right: Length, Height, and Width are features; Weight is the target. Species is context in this example. A different question could use Species as an input or as the target.'},
 {kind:'histogram',short:'Distributions',title:'A histogram groups values into ranges',copy:'Each bar counts fish whose weight falls inside that range. Read the bars together to see what is common, how far values spread, and whether the shape has a long tail.',definition:{term:'Distribution',text:'How observed values are spread across possible values.'},cue:'A bin is a range of weights. Adjacent bins touch: 100 g belongs in 100–200 g, not 0–100 g. Bar height counts fish; it is not a weight or a step in time.'},
 {kind:'scatterplot',short:'Relationships',title:'A scatterplot reveals a relationship',copy:'Each dot is one fish, positioned by its length and weight. Most dots rise from left to right: longer fish generally weigh more, although fish of similar length do not all have the same weight.',definition:{term:'Association',text:'Two variables change together; this does not by itself establish cause.'},cue:'Trace the overall upward direction, then compare two vertically separated dots with similar lengths to show that the relationship is not an exact rule.'},
 {kind:'evidence',short:'Evidence & claims',title:'Use evidence to make a careful claim',copy:'The same chart can support some statements but not others. Match the strength of the claim to what was actually observed.',definition:{term:'Evidence',text:'Observed data or results used to support, limit, or question a claim.'},cue:'Notice the limiting phrases “in this dataset” and “tend to.” They keep the supported claim aligned with the evidence.'},
 {kind:'causation',short:'Correlation ≠ causation',title:'A relationship does not prove cause',copy:'Longer fish tend to weigh more in this dataset, but the scatterplot cannot tell us why. Other factors may influence both measurements.',definition:{term:'Correlation ≠ causation',text:'Two variables changing together does not prove that one causes the other.'},cue:'Ask what else could affect both length and weight. Age, species, nutrition, and environment are plausible explanations that this chart does not separate.'},
 {kind:'purpose',short:'Why examine data?',title:'Use data examination to ask better questions',copy:'Before making a claim or building a model, use Python and pandas to understand what the observations contain. Use Seaborn to turn those observations into charts, then use the Notebook to make the investigation repeatable.',visualTitle:'From raw observations to useful questions',visualText:'Each step answers a different question about the data. pandas helps you inspect and summarize the table; Seaborn helps you visualize distributions, comparisons, and relationships before deciding what the evidence can support.',nodes:[{icon:'1',label:'Load with pandas'},{icon:'2',label:'Inspect the table'},{icon:'3',label:'Summarize patterns'},{icon:'4',label:'Visualize with Seaborn'},{icon:'5',label:'Make careful claims'}],definition:{term:'Purpose of data examination',text:'Understand the structure, patterns, relationships, missing values, and limitations in observations before drawing conclusions.'},cue:'A library is a collection of reusable code. pandas helps us work with tables; Seaborn helps us draw charts. The Notebook will guide you through each command.'}
],
cells:[
  {
    "objective": "Display a welcome message and practice running one code cell.",
    "takeaways": [
      "A code cell holds Python instructions. Run the cell to see its output.",
      "print() displays text or values. Parentheses contain what to display; straight quotes mark text."
    ],
    "prompt": "Print a short welcome message.",
    "requires": [
      "print\\s*\\("
    ],
    "hint": "Use print(\"Data Detective\") with straight quotes.",
    "error": "Check the welcome statement",
    "coach": "Type print(\"Data Detective\"), then run the cell.",
    "output": (state,code)=>code.match(/print\s*\(\s*(['"])(.*?)\1\s*\)/)?.[2]||"",
    "success": "Your welcome message is displayed."
  },
  {
    "objective": "Load Fish.csv into a pandas table for inspection.",
    "takeaways": [
      "A CSV (comma-separated values) file stores a table as text.",
      "A library is reusable code. import pandas as pd makes pandas available under the short name (alias) pd.",
      "fish is a variable: a name for the loaded table, called a DataFrame in pandas. The = sign assigns the table to that name.",
      "pd.read_csv(\"Fish.csv\") reads the file. This simulator supplies the course data; no upload is needed."
    ],
    "prompt": "Import pandas as pd, then load \"Fish.csv\" into fish with pd.read_csv().",
    "requires": [
      "import pandas as pd",
      "pd\\.read_csv\\s*\\(",
      "fish\\s*="
    ],
    "hint": "Use two lines: import pandas as pd, then fish = pd.read_csv(\"Fish.csv\").",
    "error": "Check the loading steps",
    "coach": "Import pandas as pd and assign pd.read_csv(\"Fish.csv\") to fish.",
    "output": "Simulator: Fish.csv is ready (159 rows × 6 columns).",
    "success": "fish now refers to the table. Next, inspect what it contains."
  },
  {
    "objective": "Inspect sample rows, column types, and numeric summaries.",
    "takeaways": [
      "head() previews the first five rows. The leftmost index starts at 0; the separate ID column identifies each recorded fish.",
      "info() lists column types and non-null (non-missing) counts. Each column has 159 non-missing values here. Complete values can still contain errors.",
      "int64 means whole numbers, float64 means decimal numbers, and object stores the species text here.",
      "describe() reports count, mean (average), std (standard deviation: a measure of spread), min, and max. 50% is the median (middle value); 25% and 75% mark the lower and upper quarters.",
      "Weight is in grams; Length, Height, and Width are in centimeters. Numeric ID is an identifier, so its average is not a fish measurement."
    ],
    "prompt": "Inspect fish with head(), info(), and describe().",
    "requires": [
      "\\.head\\s*\\(",
      "\\.info\\s*\\(",
      "\\.describe\\s*\\("
    ],
    "requireLabels": [
      "head()",
      "info()",
      "describe()"
    ],
    "hint": "Use print(fish.head()), fish.info(), and print(fish.describe()) on separate lines. print() makes both tables visible; info() displays its own report.",
    "error": "Finish the inspection steps",
    "coach": "Use all three methods on fish, one per line.",
    "output": (state,code)=>fishInspectionOutput(code),
    "success": "Compare the previews and summaries. Which values describe size, and which only identify a record?",
    "metrics": {
      "Rows": "159",
      "Numeric columns": "5",
      "Species": "7",
      "Missing values": "0"
    }
  },
  {
    "objective": "Show how fish weights are distributed using a histogram.",
    "takeaways": [
      "Seaborn is a plotting library. import seaborn as sb gives it the short name sb.",
      "data=fish selects the table; x=\"Weight\" selects the column on the horizontal axis. Column names are case-sensitive.",
      "bins=17 and binrange=(0, 1700) divide 0–1,700 g into 17 ranges of 100 g. Each bar counts fish in one range.",
      "Most fish are in the lighter ranges; a few much heavier fish form a long right tail. This shape is called right-skewed.",
      "Changing bins regroups the same fish; it does not change their measurements."
    ],
    "prompt": "Import seaborn as sb and plot Weight using 17 bins from 0 to 1,700 g.",
    "requires": [
      "import seaborn as (sb|sns)",
      "(sb|sns)\\.histplot\\s*\\(",
      "weight"
    ],
    "hint": "Use import seaborn as sb, then sb.histplot(data=fish, x=\"Weight\", bins=17, binrange=(0, 1700)).",
    "error": "Check the histogram settings",
    "coach": "Use fish, Weight, bins=17, and binrange=(0, 1700), as shown in the script.",
    "output": "Simulated histogram: fish counts in 100 g weight ranges.",
    "visual": true,
    "success": "Bar height is a count of fish, not their average weight."
  },
  {
    "objective": "Compare average fish weight across species with a bar plot.",
    "takeaways": [
      "x=\"Species\" puts species names on the horizontal axis; y=\"Weight\" selects the values to average.",
      "Unlike a histogram, each bar represents a category (a species). Its height is mean weight in grams, not a count of fish.",
      "Mean means average: add the weights in a species and divide by its number of fish. Individual fish can weigh much more or less.",
      "errorbar=None shows means only, keeping this first comparison focused on averages."
    ],
    "prompt": "Create a bar plot of mean Weight for each Species, with error bars turned off.",
    "requires": [
      "(sb|sns)\\.barplot\\s*\\(",
      "x\\s*=\\s*['\"]species",
      "y\\s*=\\s*['\"]weight"
    ],
    "requireLabels": [
      "barplot()",
      "x=\"Species\"",
      "y=\"Weight\""
    ],
    "hint": "Use sb.barplot(data=fish, x=\"Species\", y=\"Weight\", errorbar=None).",
    "error": "Check the species comparison",
    "coach": "Use Species on x, Weight on y, and errorbar=None.",
    "output": "Simulated bar plot: mean Weight by Species.",
    "visual": true,
    "success": "Compare group averages; a bar does not describe every fish in that species."
  },
  {
    "objective": "Explore the relationship between fish length and weight across species.",
    "takeaways": [
      "x=\"Length\" and y=\"Weight\" position each fish by its length (cm) and weight (g).",
      "hue=\"Species\" assigns a color to each species; use the legend to identify groups.",
      "Each dot is an observed fish. An upward pattern means longer fish tend to weigh more in this dataset.",
      "Fish of similar length can have different weights. An association alone does not establish cause."
    ],
    "prompt": "Create a scatterplot of Length and Weight, colored by Species.",
    "requires": [
      "(sb|sns)\\.scatterplot\\s*\\(",
      "length",
      "weight",
      "hue\\s*=\\s*['\"]species"
    ],
    "hint": "Use sb.scatterplot(data=fish, x=\"Length\", y=\"Weight\", hue=\"Species\").",
    "error": "Check the scatterplot settings",
    "coach": "Use Length on x, Weight on y, and Species for hue.",
    "output": "Simulated scatterplot: Length (cm) and Weight (g), colored by Species.",
    "success": "Describe the overall pattern and the variation between individual fish.",
    "visual": true
  }
],
explore:{tasks:[
 {id:'distribution',title:'Inspect the distribution',objective:'Describe how fish weights are distributed.',directions:'A bin is a weight range. Start with the same 17 bins as Learn and Notebook, then try another number. The same 159 fish are regrouped; their weights do not change. Describe the overall shape.',kind:'histogram',controls:[{id:'bins',label:'Histogram bins',type:'range',min:6,max:18,value:17}],question:'Which description best matches the distribution?',options:['Roughly symmetric (similar shape on both sides)','Right-skewed (a long tail toward higher weights)','Uniform (roughly equal counts across ranges)'],feedback:['Look again at where most fish are concentrated and which direction the sparse values extend.','Correct. Most fish are lighter, with a long tail toward heavier weights.','A uniform distribution would have bars of roughly equal height.'],completion:'Choose a description, explain what you see in the bars, and check your response.',evidence:'Most fish fall in the lighter-weight ranges, while a small number extend far into heavier ranges.'},
 {id:'relationship',title:'Investigate a relationship',objective:'Describe the relationship between fish length and weight.',directions:'Read the Length × Weight scatterplot, identify its direction and variation, then explain your answer.',kind:'scatterplot',question:'What relationship does the chart support?',options:['Longer fish tend to weigh more in this dataset.','Every fish gains exactly the same weight per centimeter.','Length and weight show no relationship.'],feedback:['Correct. Most dots rise from left to right, showing a positive association.','The vertical spread shows that the relationship is not exact.','The dots have a clear upward pattern from left to right.'],completion:'Choose a description, support it with the dots, and check your response.',evidence:'Most dots rise from left to right, but fish of similar lengths can still have different weights.'},
 {id:'claim',title:'Evaluate the claim',objective:'Match the strength of a claim to the evidence.',directions:'Choose the defensible claim, then justify it using something visible in the chart.',kind:'claim',question:'Which claim is supported by the evidence?',options:['Longer fish in this dataset tend to weigh more.','Increasing a fish’s length causes a predictable weight gain.','All fish species follow exactly the same length–weight rule.'],feedback:['Correct. This claim describes the association and limits it to the observed dataset.','The chart is observational and cannot establish cause.','The colored groups and vertical spread do not support one exact rule for every species.'],completion:'Choose a claim, explain what the chart can and cannot establish, and check your response.',evidence:'A careful claim describes the upward association, names the dataset, and avoids causal certainty.'}
]},
challenges:[{title:'Read the evidence',prompt:'The Length–Weight points slope upward. Which claim is best supported?',options:['Longer fish in this sample tend to weigh more.','Increasing any fish’s length will always cause a fixed weight gain.','Species has no relationship to either measurement.'],feedback:['Correct: this describes an association in the observed sample.','That is a causal and universal claim the chart cannot establish.','The colored groups visibly differ, so this claim ignores evidence.']}],reflection:'Write one evidence-based sentence about the chart and one limitation of that claim.'};
window.ML_LAB_CONFIG.explore.tasks.push(...[
  {
    "id": "loading-library",
    "title": "Identify the loading library",
    "objective": "Identify the library used to load Fish.csv.",
    "directions": "Recall the import and read_csv() commands from the notebook, then explain your answer.",
    "question": "What library did we use for loading data?",
    "options": [
      "pandas",
      "Seaborn",
      "Matplotlib"
    ],
    "feedback": [
      "Correct. pandas uses pd.read_csv() to load Fish.csv into a table.",
      "Seaborn creates charts; pandas loads the data.",
      "Matplotlib supports plotting; we used pandas to load the data."
    ],
    "completion": "Choose a library, explain its role in the loading step, and check your response.",
    "evidence": "We imported pandas as pd and used pd.read_csv(\"Fish.csv\") to load the data into a table.",
    "visual": {
      "title": "Notebook: Load data",
      "subtitle": "Review the data-loading step",
      "headline": "From a CSV file to a table",
      "copy": "import pandas as pd; fish = pd.read_csv(\"Fish.csv\")"
    },
    "kind": "notebook",
    "explanationLabel": "Explain your answer using what you did in the notebook."
  },
  {
    "id": "seaborn-purpose",
    "title": "Explain the purpose of Seaborn",
    "objective": "Identify how Seaborn helps us examine data.",
    "directions": "Recall the three plots you created in the notebook, then explain your answer.",
    "question": "The Seaborn library helps us do what?",
    "options": [
      "Load CSV files into tables",
      "Create charts to visualize data",
      "Train prediction models"
    ],
    "feedback": [
      "pandas loaded the CSV file; Seaborn visualized the data.",
      "Correct. Seaborn created the histogram, bar plot, and scatterplot to visualize the data.",
      "We used Seaborn to create charts, not to train prediction models."
    ],
    "completion": "Choose a purpose, give an example from the Notebook, and check your response.",
    "evidence": "Seaborn helped us visualize distributions with a histogram, compare species with a bar plot, and examine relationships with a scatterplot.",
    "visual": {
      "title": "Notebook: Visualize data",
      "subtitle": "Review the plotting steps",
      "headline": "Three charts for examining the fish data",
      "copy": "sb.histplot() showed the weight distribution, sb.barplot() compared species, and sb.scatterplot() showed the relationship between length and weight."
    },
    "kind": "notebook",
    "explanationLabel": "Explain your answer using what you did in the notebook."
  }
]);
window.ML_LAB_CONFIG.reviewLabel="Review";
window.ML_LAB_CONFIG.explore.tasks.forEach((task,index)=>task.correct=[1,0,0,0,1][index]);
window.ML_LAB_CONFIG.explore.tasks.unshift(...window.ML_LAB_CONFIG.explore.tasks.splice(3,2));
window.ML_LAB_CONFIG.assignment={heading:'Data Detective: Review Questions',dataset:'Fish.csv (159 observed fish)',description:'Review data-loading and visualization libraries, distributions, relationships, and supported claims.',slug:'data-detective'};
