BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(BASE_DIR))
candidate_dogs = os.path.join(PROJECT_ROOT, "Dataset", "Dog")
dogs_path = candidate_dogs if os.path.exists(candidate_dogs) else os.path.join("Dataset", "Dog")

for split in ["train", "valid"]:  # अगर valid है तो चलेगा, नहीं है तो skip कर देगा
    labels_path = os.path.join(dogs_path, split, "labels")
    
    if not os.path.exists(labels_path):
        print(f"{labels_path} not found, skipping...")
        continue
    
    for filename in os.listdir(labels_path):
        if filename.endswith(".txt"):
            file_path = os.path.join(labels_path, filename)

            with open(file_path, "r") as file:
                lines = file.readlines()

            new_lines = []
            for line in lines:
                parts = line.strip().split()
                
                if len(parts) > 0 and parts[0] == "0":
                    parts[0] = "1"
                
                new_lines.append(" ".join(parts))

            with open(file_path, "w") as file:
                file.write("\n".join(new_lines))

    print(f"{split} labels updated successfully.")

print("All Dog annotations changed from 0 to 1 ✅")
